import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import { decryptGraphSecret, encryptGraphSecret, randomBase64Url, sha256Base64Url } from "./lib/graphCrypto";

const GRAPH_SCOPES = ["openid", "profile", "offline_access", "User.Read", "Mail.Read"];

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function tenantAuthority() {
  return process.env.MICROSOFT_TENANT_ID || "organizations";
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Microsoft inbox synchronization failed.";
  return message.replace(/[\r\n]+/g, " ").slice(0, 400);
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

type GraphMessage = {
  id?: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  isRead?: boolean;
  bodyPreview?: string;
  webLink?: string;
};

async function tokenRequest(parameters: Record<string, string>) {
  const response = await fetch(`https://login.microsoftonline.com/${tenantAuthority()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(parameters),
  });
  const body = await response.json() as TokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`Microsoft authorization failed (${response.status}): ${body.error_description || body.error || "token unavailable"}`);
  }
  return body;
}

async function fetchInbox(accessToken: string) {
  const endpoint = new URL("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages");
  endpoint.searchParams.set("$select", "id,subject,from,receivedDateTime,isRead,bodyPreview,webLink");
  endpoint.searchParams.set("$orderby", "receivedDateTime desc");
  endpoint.searchParams.set("$top", "75");
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.body-content-type="text"',
    },
  });
  const body = await response.json() as { value?: GraphMessage[]; error?: { message?: string } };
  if (!response.ok) throw new Error(`Microsoft Graph inbox request failed (${response.status}): ${body.error?.message || "request rejected"}`);
  return (body.value ?? [])
    .filter((message): message is GraphMessage & { id: string } => Boolean(message.id))
    .map((message) => ({
      graphId: message.id,
      subject: message.subject?.trim() || "(No subject)",
      senderName: message.from?.emailAddress?.name?.trim() || "Unknown sender",
      senderAddress: message.from?.emailAddress?.address?.trim().toLocaleLowerCase() || "",
      receivedAt: message.receivedDateTime || new Date(0).toISOString(),
      isRead: Boolean(message.isRead),
      preview: message.bodyPreview?.replace(/\s+/g, " ").trim().slice(0, 1000) || "",
      webLink: message.webLink || undefined,
    }));
}

export const beginConnection = action({
  args: {},
  handler: async (ctx): Promise<{ authorizationUrl: string }> => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Sign in before connecting Microsoft Outlook.");
    const clientId = requiredEnv("MICROSOFT_CLIENT_ID");
    const redirectUri = requiredEnv("MICROSOFT_GRAPH_REDIRECT_URI");
    requiredEnv("MICROSOFT_CLIENT_SECRET");
    const state = randomBase64Url(32);
    const codeVerifier = randomBase64Url(64);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const encryptedVerifier = await encryptGraphSecret(codeVerifier);
    await ctx.runMutation(internal.graphData.beginConnection, {
      ownerId,
      pendingState: state,
      encryptedCodeVerifier: encryptedVerifier.ciphertext,
      codeVerifierIv: encryptedVerifier.iv,
      stateExpiresAt: Date.now() + 10 * 60 * 1000,
    });
    const authorization = new URL(`https://login.microsoftonline.com/${tenantAuthority()}/oauth2/v2.0/authorize`);
    authorization.searchParams.set("client_id", clientId);
    authorization.searchParams.set("response_type", "code");
    authorization.searchParams.set("redirect_uri", redirectUri);
    authorization.searchParams.set("response_mode", "query");
    authorization.searchParams.set("scope", GRAPH_SCOPES.join(" "));
    authorization.searchParams.set("state", state);
    authorization.searchParams.set("code_challenge", codeChallenge);
    authorization.searchParams.set("code_challenge_method", "S256");
    authorization.searchParams.set("prompt", "select_account");
    return { authorizationUrl: authorization.toString() };
  },
});

export const syncNow = action({
  args: {},
  handler: async (ctx): Promise<{ synced: number }> => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Sign in before synchronizing Microsoft Outlook.");
    return await ctx.runAction(internal.microsoftGraph.syncConnection, { ownerId });
  },
});

export const syncConnection = internalAction({
  args: { ownerId: v.id("users") },
  handler: async (ctx, args): Promise<{ synced: number }> => {
    await ctx.runMutation(internal.graphData.markSyncing, { ownerId: args.ownerId });
    try {
      const connection = await ctx.runQuery(internal.graphData.connectionForSync, { ownerId: args.ownerId });
      if (!connection?.encryptedRefreshToken || !connection.refreshTokenIv || connection.status !== "connected") {
        throw new Error("Microsoft Outlook is not connected.");
      }
      const refreshToken = await decryptGraphSecret(connection.encryptedRefreshToken, connection.refreshTokenIv);
      const tokens = await tokenRequest({
        client_id: requiredEnv("MICROSOFT_CLIENT_ID"),
        client_secret: requiredEnv("MICROSOFT_CLIENT_SECRET"),
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        redirect_uri: requiredEnv("MICROSOFT_GRAPH_REDIRECT_URI"),
        scope: GRAPH_SCOPES.join(" "),
      });
      const messages = await fetchInbox(tokens.access_token!);
      const rotatedRefreshToken = tokens.refresh_token
        ? await encryptGraphSecret(tokens.refresh_token)
        : undefined;
      return await ctx.runMutation(internal.graphData.storeSyncResults, {
        ownerId: args.ownerId,
        messages,
        rotatedRefreshToken,
      });
    } catch (error) {
      const message = safeError(error);
      await ctx.runMutation(internal.graphData.markSyncError, { ownerId: args.ownerId, message });
      throw new Error(message, { cause: error });
    }
  },
});

export const syncAllConnections = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scheduled: number }> => {
    const ownerIds = await ctx.runQuery(internal.graphData.connectedOwnerIds, {});
    for (const [index, ownerId] of ownerIds.entries()) {
      await ctx.scheduler.runAfter(index * 500, internal.microsoftGraph.syncConnection, { ownerId: ownerId as Id<"users"> });
    }
    return { scheduled: ownerIds.length };
  },
});
