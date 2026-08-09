import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { decryptGraphSecret, encryptGraphSecret, sha256Base64Url } from "./lib/graphCrypto";
import { providerConnectionRedirect } from "./lib/mailDelivery";

const SCOPES = "openid profile offline_access User.Read Mail.Read Mail.Send Files.Read";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function appRedirect(result: "connected" | "error") {
  return `${requiredEnv("SITE_URL").replace(/\/+$/, "")}${providerConnectionRedirect("microsoft", result)}`;
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
    const stateHash = await sha256Base64Url(state);
    const attempt = await ctx.runMutation(internal.graphData.consumeAuthAttempt, { stateHash });
    ownerId = attempt.ownerId;
    const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
    if (oauthError) throw new Error(`Microsoft authorization was declined: ${oauthError}`);
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Microsoft returned an incomplete authorization response.");
    const verifier = await decryptGraphSecret(attempt.encryptedCodeVerifier, attempt.codeVerifierIv);
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || "common"}/oauth2/v2.0/token`, {
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
      scope?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token) {
      throw new Error(`Microsoft token exchange failed (${tokenResponse.status}): ${tokens.error_description || tokens.error || "tokens unavailable"}`);
    }
    const grantedScopes = new Set((tokens.scope || "").split(/\s+/).map((scope) => scope.toLocaleLowerCase()));
    const missingScopes = ["user.read", "mail.read", "mail.send", "files.read"].filter((scope) => !grantedScopes.has(scope));
    if (missingScopes.length) throw new Error(`Microsoft did not grant required permissions: ${missingScopes.join(", ")}.`);
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
      ownerId: attempt.ownerId,
      encryptedRefreshToken: encryptedToken.ciphertext,
      refreshTokenIv: encryptedToken.iv,
      microsoftUserId: profile.id,
      email: profile.mail || profile.userPrincipalName || "Microsoft account",
      displayName: profile.displayName || "Oakridge Microsoft account",
    });
    await ctx.scheduler.runAfter(0, internal.microsoftGraph.syncConnection, { ownerId: attempt.ownerId });
    return new Response(null, { status: 302, headers: { Location: appRedirect("connected") } });
  } catch (error) {
    if (ownerId) {
      await ctx.runMutation(internal.graphData.markConnectionError, { ownerId, message: safeError(error) });
    }
    return new Response(null, { status: 302, headers: { Location: appRedirect("error") } });
  }
});
