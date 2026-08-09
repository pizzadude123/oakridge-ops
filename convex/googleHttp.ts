import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { decryptGraphSecret, encryptGraphSecret, sha256Base64Url } from "./lib/graphCrypto";
import { providerConnectionRedirect } from "./lib/mailDelivery";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function appRedirect(result: "connected" | "error") {
  return `${requiredEnv("SITE_URL").replace(/\/+$/, "")}${providerConnectionRedirect("google", result)}`;
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Google authorization failed.")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 400);
}

export const googleCallback = httpAction(async (ctx, request) => {
  let ownerId: Id<"users"> | null = null;
  try {
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    if (!state) throw new Error("Google returned no authorization state.");
    const stateHash = await sha256Base64Url(state);
    const attempt = await ctx.runMutation(internal.googleData.consumeAuthAttempt, { stateHash });
    ownerId = attempt.ownerId;
    const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
    if (oauthError) throw new Error(`Google authorization was declined: ${oauthError}`);
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Google returned an incomplete authorization response.");
    const verifier = await decryptGraphSecret(attempt.encryptedCodeVerifier, attempt.codeVerifierIv);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: requiredEnv("GOOGLE_CLIENT_ID"),
        client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: requiredEnv("GOOGLE_GMAIL_REDIRECT_URI"),
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
      throw new Error(`Google token exchange failed (${tokenResponse.status}): ${tokens.error_description || tokens.error || "offline token unavailable"}`);
    }
    if (!(tokens.scope || "").split(/\s+/).includes("https://www.googleapis.com/auth/gmail.send")) {
      throw new Error("Google did not grant Gmail sending permission.");
    }
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileResponse.json() as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      error_description?: string;
    };
    if (!profileResponse.ok || !profile.sub || !profile.email || profile.email_verified !== true) {
      throw new Error(`Google profile request failed (${profileResponse.status}): ${profile.error_description || "verified profile unavailable"}`);
    }
    const encryptedToken = await encryptGraphSecret(tokens.refresh_token);
    await ctx.runMutation(internal.googleData.completeConnection, {
      ownerId: attempt.ownerId,
      encryptedRefreshToken: encryptedToken.ciphertext,
      refreshTokenIv: encryptedToken.iv,
      googleUserId: profile.sub,
      email: profile.email,
      displayName: profile.name || profile.email,
    });
    return new Response(null, { status: 302, headers: { Location: appRedirect("connected") } });
  } catch (error) {
    if (ownerId) await ctx.runMutation(internal.googleData.markConnectionError, { ownerId, message: safeError(error) });
    return new Response(null, { status: 302, headers: { Location: appRedirect("error") } });
  }
});
