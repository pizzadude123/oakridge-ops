import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { decryptGraphSecret, encryptGraphSecret } from "./lib/graphCrypto";

const SCOPES = "openid profile offline_access User.Read Mail.Read";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function appRedirect(result: "connected" | "error") {
  return `${requiredEnv("SITE_URL").replace(/\/+$/, "")}/#/inbox?graph=${result}`;
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Microsoft authorization failed.")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 400);
}

export const graphCallback = httpAction(async (ctx, request) => {
  let ownerId: Id<"users"> | null = null;
  try {
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    if (!state) throw new Error("Microsoft returned no authorization state.");
    const pending = await ctx.runQuery(internal.graphData.pendingByState, { state });
    if (!pending || pending.status !== "pending") throw new Error("Microsoft authorization state is invalid or already used.");
    ownerId = pending.ownerId;
    if (!pending.stateExpiresAt || pending.stateExpiresAt < Date.now()) throw new Error("Microsoft authorization expired. Start the connection again.");
    const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
    if (oauthError) throw new Error(`Microsoft authorization was declined: ${oauthError}`);
    const code = url.searchParams.get("code");
    if (!code || !pending.encryptedCodeVerifier || !pending.codeVerifierIv) throw new Error("Microsoft returned an incomplete authorization response.");
    const verifier = await decryptGraphSecret(pending.encryptedCodeVerifier, pending.codeVerifierIv);
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || "organizations"}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: requiredEnv("MICROSOFT_CLIENT_ID"),
        client_secret: requiredEnv("MICROSOFT_CLIENT_SECRET"),
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: requiredEnv("MICROSOFT_GRAPH_REDIRECT_URI"),
        scope: SCOPES,
      }),
    });
    const tokens = await tokenResponse.json() as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token) {
      throw new Error(`Microsoft token exchange failed (${tokenResponse.status}): ${tokens.error_description || tokens.error || "tokens unavailable"}`);
    }
    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileResponse.json() as {
      id?: string;
      displayName?: string;
      mail?: string | null;
      userPrincipalName?: string;
      error?: { message?: string };
    };
    if (!profileResponse.ok || !profile.id) {
      throw new Error(`Microsoft profile request failed (${profileResponse.status}): ${profile.error?.message || "profile unavailable"}`);
    }
    const encryptedToken = await encryptGraphSecret(tokens.refresh_token);
    await ctx.runMutation(internal.graphData.completeConnection, {
      ownerId,
      encryptedRefreshToken: encryptedToken.ciphertext,
      refreshTokenIv: encryptedToken.iv,
      microsoftUserId: profile.id,
      email: profile.mail || profile.userPrincipalName || "Microsoft account",
      displayName: profile.displayName || "Oakridge Microsoft account",
    });
    await ctx.scheduler.runAfter(0, internal.microsoftGraph.syncConnection, { ownerId });
    return new Response(null, { status: 302, headers: { Location: appRedirect("connected") } });
  } catch (error) {
    if (ownerId) {
      await ctx.runMutation(internal.graphData.markConnectionError, { ownerId, message: safeError(error) });
    }
    return new Response(null, { status: 302, headers: { Location: appRedirect("error") } });
  }
});
