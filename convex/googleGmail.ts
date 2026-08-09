"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import sanitizeHtml from "sanitize-html";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { buildOakridgeEmailHtml, personalizeTemplate } from "../src/domain/email";
import { decryptGraphSecret, encryptGraphSecret, randomBase64Url, sha256Base64Url } from "./lib/graphCrypto";
import { buildGmailRawMessage } from "./lib/gmailMessage";
import { sanitizeEditorHtml } from "./lib/mailContent";

const GOOGLE_SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.send"];
const MAX_RECIPIENTS_PER_REQUEST = 50;

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Google could not send this message.")
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
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const body = await response.json() as TokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`Google authorization failed (${response.status}): ${body.error_description || body.error || "token unavailable"}`);
  }
  return body;
}

async function gmailError(response: Response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { error?: { message?: string } };
    return body.error?.message?.slice(0, 240) || `Gmail rejected the message (${response.status}).`;
  } catch {
    return `Gmail rejected the message (${response.status}).`;
  }
}

async function postGmail(accessToken: string, raw: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    if (response.status !== 429 || attempt === 1) return response;
    const retrySeconds = Math.min(Number(response.headers.get("Retry-After") || "1"), 5);
    await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1000));
  }
  throw new Error("Gmail did not accept the message.");
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

export const beginConnection = action({
  args: {},
  handler: async (ctx): Promise<{ authorizationUrl: string }> => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Sign in before connecting Google.");
    const clientId = requiredEnv("GOOGLE_CLIENT_ID");
    const redirectUri = requiredEnv("GOOGLE_GMAIL_REDIRECT_URI");
    requiredEnv("GOOGLE_CLIENT_SECRET");
    const state = randomBase64Url(32);
    const stateHash = await sha256Base64Url(state);
    const codeVerifier = randomBase64Url(64);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const encryptedVerifier = await encryptGraphSecret(codeVerifier);
    await ctx.runMutation(internal.googleData.createAuthAttempt, {
      ownerId,
      stateHash,
      encryptedCodeVerifier: encryptedVerifier.ciphertext,
      codeVerifierIv: encryptedVerifier.iv,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorization.searchParams.set("client_id", clientId);
    authorization.searchParams.set("response_type", "code");
    authorization.searchParams.set("redirect_uri", redirectUri);
    authorization.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
    authorization.searchParams.set("state", state);
    authorization.searchParams.set("code_challenge", codeChallenge);
    authorization.searchParams.set("code_challenge_method", "S256");
    authorization.searchParams.set("access_type", "offline");
    authorization.searchParams.set("prompt", "consent select_account");
    return { authorizationUrl: authorization.toString() };
  },
});

export const disconnect = action({
  args: {},
  handler: async (ctx): Promise<{ disconnected: true }> => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Sign in before disconnecting Google.");
    const connection = await ctx.runQuery(internal.googleData.connectionForSend, { ownerId });
    if (connection?.encryptedRefreshToken && connection.refreshTokenIv) {
      try {
        const refreshToken = await decryptGraphSecret(connection.encryptedRefreshToken, connection.refreshTokenIv);
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: refreshToken }),
        });
      } catch {
        // Local removal still prevents this application from using the token.
      }
    }
    await ctx.runMutation(internal.googleData.removeConnection, { ownerId });
    return { disconnected: true };
  },
});

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

    const [connection, contacts] = await Promise.all([
      ctx.runQuery(internal.googleData.connectionForSend, { ownerId }),
      ctx.runQuery(internal.contacts.forMailSend, { ownerId, contactIds: uniqueIds }),
    ]);
    if (!connection?.encryptedRefreshToken || !connection.refreshTokenIv || connection.status !== "connected") {
      throw new Error("Connect a Google account before sending email.");
    }
    const senderEmail = connection.email || "Connected Google account";
    const cleanTemplate = sanitizeEditorHtml(args.bodyHtmlTemplate);
    const prepared = contacts.map((contact) => {
      const fields = contactFields(contact);
      const personalizedSubject = personalizeTemplate(args.subjectTemplate, fields);
      const personalizedBody = personalizeTemplate(cleanTemplate, fields, "html");
      const unresolved = [...new Set([...personalizedSubject.unresolved, ...personalizedBody.unresolved])];
      if (unresolved.length) {
        throw new Error(`${contact.fullName} is missing ${unresolved.map((field) => `{{${field}}}`).join(", ")}. No emails were sent.`);
      }
      const html = buildOakridgeEmailHtml({ bodyHtml: personalizedBody.output, preheader: personalizedSubject.output });
      const bodyText = sanitizeHtml(personalizedBody.output, { allowedTags: [] }).replace(/\s+/g, " ").trim();
      const raw = buildGmailRawMessage({
        senderEmail,
        recipientEmail: contact.email,
        recipientName: contact.fullName,
        subject: personalizedSubject.output,
        text: bodyText,
        html,
      });
      return { contact, subject: personalizedSubject.output, html, bodyText, raw };
    });

    const refreshToken = await decryptGraphSecret(connection.encryptedRefreshToken, connection.refreshTokenIv);
    let tokens: Awaited<ReturnType<typeof refreshAccessToken>>;
    try {
      tokens = await refreshAccessToken(refreshToken);
    } catch (error) {
      const message = safeError(error);
      await ctx.runMutation(internal.googleData.markReauthorizationRequired, { ownerId, message });
      throw new Error("Google authorization expired or was revoked. Reconnect Google and try again.", { cause: error });
    }
    if (tokens.refresh_token) {
      const encrypted = await encryptGraphSecret(tokens.refresh_token);
      await ctx.runMutation(internal.googleData.rotateRefreshToken, {
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
      const claim = await ctx.runMutation(internal.messages.claimProviderDelivery, {
        ownerId,
        contactId: item.contact._id,
        batchId: args.batchId,
        recipientEmail: item.contact.email,
        recipientName: item.contact.fullName,
        senderEmail,
        provider: "google_gmail",
        subject: item.subject,
        bodyHtml: item.html,
        bodyText: item.bodyText,
      });
      if (!claim.claimed) {
        skipped += 1;
        continue;
      }
      let status: "accepted" | "failed" | "unknown" = "unknown";
      let providerMessageId: string | undefined;
      let providerError: string | undefined;
      try {
        const response = await postGmail(tokens.access_token!, item.raw);
        if (response.ok) {
          const result = await response.json() as { id?: string };
          if (!result.id) throw new Error("Gmail accepted the request without a message identifier.");
          providerMessageId = result.id;
          status = "accepted";
          accepted += 1;
        } else {
          status = "failed";
          providerError = await gmailError(response);
          failed += 1;
          failures.push(`${item.contact.fullName}: ${providerError}`);
        }
      } catch (error) {
        providerError = `Gmail send outcome is unknown. Check Sent mail before retrying. ${safeError(error)}`;
        failed += 1;
        failures.push(`${item.contact.fullName}: ${providerError}`);
      }
      await ctx.runMutation(internal.messages.finalizeProviderDelivery, {
        ownerId,
        contactId: item.contact._id,
        batchId: args.batchId,
        provider: "google_gmail",
        providerMessageId,
        status,
        providerError,
      });
    }
    return { accepted, failed, skipped, senderEmail, failures };
  },
});
