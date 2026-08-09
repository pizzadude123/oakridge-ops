"use node";

import { v } from "convex/values";
import sanitizeHtml from "sanitize-html";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { buildOakridgeEmailHtml, personalizeTemplate } from "../src/domain/email";
import { decryptGraphSecret, encryptGraphSecret, randomBase64Url, sha256Base64Url } from "./lib/graphCrypto";
import { buildGmailRawMessage } from "./lib/gmailMessage";
import {
  classifyProviderHttpFailure,
  legacyProviderCampaignMaterial,
  providerCampaignMaterial,
  providerRecipientDeliveryMaterial,
  ProviderTokenError,
  readResponseTextSafely,
  shouldRequireReauthorization,
} from "./lib/mailDelivery";
import { sanitizeEditorHtml } from "./lib/mailContent";
import { prepareEmailAssets } from "./lib/prepareEmailAssets";
import { requireAdministratorAction } from "./lib/requireUser";

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
    throw new ProviderTokenError(
      response.status,
      body.error,
      `Google authorization failed (${response.status}): ${body.error_description || body.error || "token unavailable"}`,
    );
  }
  return body;
}

async function gmailError(response: Response) {
  const text = await readResponseTextSafely(response);
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
    const ownerId = await requireAdministratorAction(ctx, "Sign in before connecting Google.");
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
    const ownerId = await requireAdministratorAction(ctx, "Sign in before disconnecting Google.");
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
    imageAssets: v.optional(v.array(v.object({
      assetId: v.id("emailAssets"),
      alt: v.string(),
      placement: v.optional(v.union(v.literal("header"), v.literal("body"), v.literal("footer"))),
      width: v.optional(v.union(v.literal("full"), v.literal("wide"), v.literal("compact"))),
      alignment: v.optional(v.union(v.literal("left"), v.literal("center"), v.literal("right"))),
    }))),
    confirmation: v.string(),
  },
  handler: async (ctx, args): Promise<{
    accepted: number;
    failed: number;
    unknown: number;
    inProgress: number;
    alreadyAccepted: number;
    senderEmail: string;
    failures: string[];
  }> => {
    const ownerId = await requireAdministratorAction(ctx, "Sign in before sending email.");
    const uniqueIds = [...new Set(args.contactIds)] as Id<"contacts">[];
    if (!uniqueIds.length || uniqueIds.length > MAX_RECIPIENTS_PER_REQUEST) {
      throw new Error(`Choose between 1 and ${MAX_RECIPIENTS_PER_REQUEST} recipients per send request.`);
    }
    if (args.confirmation !== `SEND ${uniqueIds.length}`) throw new Error("Review and confirm the recipient count before sending.");
    const subjectTemplate = args.subjectTemplate.trim();
    if (!subjectTemplate || subjectTemplate.length > 200) throw new Error("Add a subject under 200 characters.");
    if (!args.bodyHtmlTemplate.trim() || args.bodyHtmlTemplate.length > 100_000) throw new Error("Add an email message before sending.");
    const cleanTemplate = sanitizeEditorHtml(args.bodyHtmlTemplate).trim();
    if (!cleanTemplate) throw new Error("Add an email message before sending.");

    const [connection, contacts] = await Promise.all([
      ctx.runQuery(internal.googleData.connectionForSend, { ownerId }),
      ctx.runQuery(internal.contacts.forMailSend, { ownerId, contactIds: uniqueIds }),
    ]);
    if (!connection?.encryptedRefreshToken || !connection.refreshTokenIv || connection.status !== "connected") {
      throw new Error("Connect a Google account before sending email.");
    }
    if (contacts.length !== uniqueIds.length) throw new Error("One or more selected recipients are unavailable. No emails were sent.");
    const emailAssets = await prepareEmailAssets(ctx, ownerId, args.imageAssets ?? []);
    const senderEmail = connection.email || "Connected Google account";
    const campaignBody = emailAssets.inlineImages.length
      ? `${cleanTemplate}\n<!-- oakridge-email-assets:${emailAssets.campaignMaterial} -->`
      : cleanTemplate;
    const campaignMaterial = providerCampaignMaterial("google_gmail", senderEmail, subjectTemplate, campaignBody);
    const legacyBatchId = await sha256Base64Url(legacyProviderCampaignMaterial("google_gmail", subjectTemplate, cleanTemplate));
    const prepared = await Promise.all(contacts.map(async (contact) => {
      const fields = contactFields(contact);
      const personalizedSubject = personalizeTemplate(subjectTemplate, fields);
      const personalizedBody = personalizeTemplate(cleanTemplate, fields, "html");
      const unresolved = [...new Set([...personalizedSubject.unresolved, ...personalizedBody.unresolved])];
      if (unresolved.length) {
        throw new Error(`${contact.fullName} is missing ${unresolved.map((field) => `{{${field}}}`).join(", ")}. No emails were sent.`);
      }
      const html = buildOakridgeEmailHtml({ bodyHtml: personalizedBody.output, preheader: personalizedSubject.output, images: emailAssets.layoutImages });
      const bodyText = sanitizeHtml(personalizedBody.output, { allowedTags: [] }).replace(/\s+/g, " ").trim();
      const batchId = await sha256Base64Url(providerRecipientDeliveryMaterial(
        campaignMaterial,
        contact.email,
        contact.fullName,
        personalizedSubject.output,
        html,
      ));
      const raw = buildGmailRawMessage({
        senderEmail,
        recipientEmail: contact.email,
        recipientName: contact.fullName,
        subject: personalizedSubject.output,
        text: bodyText,
        html,
        inlineImages: emailAssets.inlineImages,
      });
      return { contact, subject: personalizedSubject.output, html, bodyText, raw, batchId };
    }));

    const refreshToken = await decryptGraphSecret(connection.encryptedRefreshToken, connection.refreshTokenIv);
    let tokens: Awaited<ReturnType<typeof refreshAccessToken>>;
    try {
      tokens = await refreshAccessToken(refreshToken);
    } catch (error) {
      const message = safeError(error);
      if (error instanceof ProviderTokenError && shouldRequireReauthorization(error.status, error.providerError)) {
        await ctx.runMutation(internal.googleData.markReauthorizationRequired, { ownerId, message });
        throw new Error("Google authorization expired or was revoked. Reconnect Google and try again.", { cause: error });
      }
      throw new Error("Google is temporarily unavailable. The connection remains active; try again later.", { cause: error });
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
    let unknown = 0;
    let inProgress = 0;
    let alreadyAccepted = 0;
    const failures: string[] = [];
    for (const item of prepared) {
      const attemptToken = randomBase64Url(24);
      const claim = await ctx.runMutation(internal.messages.claimProviderDelivery, {
        ownerId,
        contactId: item.contact._id,
        batchId: item.batchId,
        legacyBatchIds: [legacyBatchId],
        recipientEmail: item.contact.email,
        recipientName: item.contact.fullName,
        senderEmail,
        provider: "google_gmail",
        subject: item.subject,
        bodyHtml: item.html,
        bodyText: item.bodyText,
        attemptToken,
      });
      if (!claim.claimed) {
        if (claim.status === "unknown") unknown += 1;
        else if (claim.status === "sending") inProgress += 1;
        else alreadyAccepted += 1;
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
          status = classifyProviderHttpFailure(response.status);
          const detail = await gmailError(response);
          providerError = status === "unknown"
            ? `Gmail send outcome is unknown. Check Sent mail before retrying. ${detail}`
            : detail;
          if (status === "failed") failed += 1;
          else unknown += 1;
          failures.push(`${item.contact.fullName}: ${providerError}`);
        }
      } catch (error) {
        providerError = `Gmail send outcome is unknown. Check Sent mail before retrying. ${safeError(error)}`;
        unknown += 1;
        failures.push(`${item.contact.fullName}: ${providerError}`);
      }
      await ctx.runMutation(internal.messages.finalizeProviderDelivery, {
        ownerId,
        contactId: item.contact._id,
        batchId: item.batchId,
        provider: "google_gmail",
        providerMessageId,
        status,
        providerError,
        attemptToken,
      });
    }
    return { accepted, failed, unknown, inProgress, alreadyAccepted, senderEmail, failures };
  },
});
