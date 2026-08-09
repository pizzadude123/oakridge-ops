"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import sanitizeHtml from "sanitize-html";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { buildGraphSendMailPayload, buildOakridgeEmailHtml, personalizeTemplate } from "../src/domain/email";
import { decryptGraphSecret, encryptGraphSecret } from "./lib/graphCrypto";
import { sanitizeEditorHtml } from "./lib/mailContent";

const GRAPH_SCOPES = "openid profile offline_access User.Read Mail.Read Mail.Send Files.Read";
const MAX_RECIPIENTS_PER_REQUEST = 50;

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function tenantAuthority() {
  return process.env.MICROSOFT_TENANT_ID || "organizations";
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Microsoft could not send this message.")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 300);
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

async function refreshAccessToken(refreshToken: string) {
  const response = await fetch(`https://login.microsoftonline.com/${tenantAuthority()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredEnv("MICROSOFT_CLIENT_ID"),
      client_secret: requiredEnv("MICROSOFT_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      redirect_uri: requiredEnv("MICROSOFT_GRAPH_REDIRECT_URI"),
      scope: GRAPH_SCOPES,
    }),
  });
  const body = await response.json() as TokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`Microsoft authorization failed (${response.status}): ${body.error_description || body.error || "token unavailable"}`);
  }
  return body;
}

async function graphError(response: Response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { error?: { message?: string } };
    return body.error?.message?.slice(0, 240) || `Microsoft Graph rejected the message (${response.status}).`;
  } catch {
    return `Microsoft Graph rejected the message (${response.status}).`;
  }
}

async function postMail(accessToken: string, payload: ReturnType<typeof buildGraphSendMailPayload>) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (response.status !== 429 || attempt === 1) return response;
    const retrySeconds = Math.min(Number(response.headers.get("Retry-After") || "1"), 5);
    await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1000));
  }
  throw new Error("Microsoft Graph did not accept the message.");
}

function contactFields(contact: {
  fullName: string;
  email: string;
  school: string;
  preference1?: string;
  preference2?: string;
  preference3?: string;
  assignedCommittee?: string;
  assignedAllocation?: string;
}) {
  return {
    firstName: contact.fullName.split(/\s+/)[0] || contact.fullName,
    fullName: contact.fullName,
    email: contact.email,
    school: contact.school,
    committee: contact.assignedCommittee || contact.preference1 || "",
    allocation: contact.assignedAllocation || "",
    preference1: contact.preference1 || "",
    preference2: contact.preference2 || "",
    preference3: contact.preference3 || "",
  };
}

export const sendPersonalizedBatch = action({
  args: {
    contactIds: v.array(v.id("contacts")),
    subjectTemplate: v.string(),
    bodyHtmlTemplate: v.string(),
    batchId: v.string(),
    confirmation: v.string(),
  },
  handler: async (ctx, args): Promise<{
    accepted: number;
    failed: number;
    skipped: number;
    senderEmail: string;
    failures: string[];
  }> => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Sign in before sending email.");
    const uniqueIds = [...new Set(args.contactIds)] as Id<"contacts">[];
    if (!uniqueIds.length || uniqueIds.length > MAX_RECIPIENTS_PER_REQUEST) {
      throw new Error(`Choose between 1 and ${MAX_RECIPIENTS_PER_REQUEST} recipients per send request.`);
    }
    if (args.confirmation !== `SEND ${uniqueIds.length}`) throw new Error("Review and confirm the recipient count before sending.");
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(args.batchId)) throw new Error("The email campaign identifier is invalid.");
    if (!args.subjectTemplate.trim() || args.subjectTemplate.length > 200) throw new Error("Add a subject under 200 characters.");
    if (!args.bodyHtmlTemplate.trim() || args.bodyHtmlTemplate.length > 100_000) throw new Error("Add an email message before sending.");

    const [connection, contacts, existingResults] = await Promise.all([
      ctx.runQuery(internal.graphData.connectionForSync, { ownerId }),
      ctx.runQuery(internal.contacts.forMailSend, { ownerId, contactIds: uniqueIds }),
      ctx.runQuery(internal.messages.batchResults, { ownerId, batchId: args.batchId }),
    ]);
    if (!connection?.encryptedRefreshToken || !connection.refreshTokenIv || connection.status !== "connected") {
      throw new Error("Connect Microsoft Outlook before sending email.");
    }
    const senderEmail = connection.email || "Connected Outlook account";
    const cleanTemplate = sanitizeEditorHtml(args.bodyHtmlTemplate);
    const prepared = contacts.map((contact) => {
      const fields = contactFields(contact);
      const subject = personalizeTemplate(args.subjectTemplate, fields);
      const body = personalizeTemplate(cleanTemplate, fields, "html");
      const unresolved = [...new Set([...subject.unresolved, ...body.unresolved])];
      if (unresolved.length) {
        throw new Error(`${contact.fullName} is missing ${unresolved.map((field) => `{{${field}}}`).join(", ")}. No emails were sent.`);
      }
      const html = buildOakridgeEmailHtml({ bodyHtml: body.output, preheader: subject.output });
      const bodyText = sanitizeHtml(body.output, { allowedTags: [] }).replace(/\s+/g, " ").trim();
      return { contact, subject: subject.output, html, bodyText };
    });

    const alreadyAccepted = new Set(existingResults.filter((message) => message.status === "sent").map((message) => String(message.contactId)));
    const refreshToken = await decryptGraphSecret(connection.encryptedRefreshToken, connection.refreshTokenIv);
    const tokens = await refreshAccessToken(refreshToken);
    if (tokens.refresh_token) {
      const encrypted = await encryptGraphSecret(tokens.refresh_token);
      await ctx.runMutation(internal.graphData.rotateRefreshToken, {
        ownerId,
        encryptedRefreshToken: encrypted.ciphertext,
        refreshTokenIv: encrypted.iv,
      });
    }

    let accepted = 0;
    let failed = 0;
    let skipped = 0;
    const failures: string[] = [];
    for (const item of prepared) {
      if (alreadyAccepted.has(String(item.contact._id))) {
        skipped += 1;
        continue;
      }
      let status: "sent" | "failed" = "failed";
      let providerError: string | undefined;
      try {
        const response = await postMail(tokens.access_token!, buildGraphSendMailPayload({
          recipientEmail: item.contact.email,
          recipientName: item.contact.fullName,
          subject: item.subject,
          html: item.html,
        }));
        if (response.status === 202) {
          status = "sent";
          accepted += 1;
        } else {
          providerError = await graphError(response);
          failed += 1;
          failures.push(`${item.contact.fullName}: ${providerError}`);
        }
      } catch (error) {
        providerError = safeError(error);
        failed += 1;
        failures.push(`${item.contact.fullName}: ${providerError}`);
      }
      await ctx.runMutation(internal.messages.recordProviderResult, {
        ownerId,
        contactId: item.contact._id,
        batchId: args.batchId,
        recipientEmail: item.contact.email,
        recipientName: item.contact.fullName,
        senderEmail,
        subject: item.subject,
        bodyHtml: item.html,
        bodyText: item.bodyText,
        status,
        providerError,
      });
    }
    return { accepted, failed, skipped, senderEmail, failures };
  },
});
