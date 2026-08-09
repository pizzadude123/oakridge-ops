import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import {
  validateEmailAssetMetadata,
  validateEmailImageBytes,
  validateEmailUploadHeaders,
} from "./lib/emailAssets";

function allowedOrigin() {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) throw new Error("SITE_URL is not configured.");
  return new URL(siteUrl).origin;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": allowedOrigin(),
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
}

function response(status: number, body: object) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}

function requireAllowedOrigin(request: Request) {
  if (request.headers.get("Origin") !== allowedOrigin()) {
    throw new Error("This upload origin is not allowed.");
  }
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "The email image could not be uploaded.")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 300);
}

export const emailAssetUploadOptions = httpAction(async (_ctx, request) => {
  try {
    requireAllowedOrigin(request);
    return new Response(null, { status: 204, headers: corsHeaders() });
  } catch (error) {
    return response(403, { error: safeError(error) });
  }
});

export const emailAssetUpload = httpAction(async (ctx, request) => {
  let storageId: Awaited<ReturnType<typeof ctx.storage.store>> | null = null;
  let ownerId: Id<"users"> | null = null;
  let fileName = "Email image";
  let registered = false;
  try {
    requireAllowedOrigin(request);
    ownerId = await getAuthUserId(ctx);
    if (!ownerId) return response(401, { error: "Sign in before uploading email images." });
    const { contentType, declaredSize } = validateEmailUploadHeaders({
      contentLength: request.headers.get("Content-Length"),
      contentType: request.headers.get("Content-Type"),
    });
    const arrayBuffer = await request.arrayBuffer();
    const validated = validateEmailAssetMetadata({ contentType, size: arrayBuffer.byteLength });
    if (declaredSize !== null && declaredSize !== validated.size) {
      throw new Error("The uploaded image size did not match the request.");
    }
    validateEmailImageBytes(new Uint8Array(arrayBuffer), validated.contentType);
    const blob = new Blob([arrayBuffer], { type: validated.contentType });
    storageId = await ctx.storage.store(blob);
    fileName = new URL(request.url).searchParams.get("filename") ?? "Email image";
    const asset = await ctx.runMutation(internal.emailAssets.registerStored, {
      ownerId,
      storageId,
      fileName,
    });
    registered = true;
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("The uploaded image is unavailable. Upload it again.");
    return response(201, { ...asset, url });
  } catch (error) {
    if (storageId) {
      const storageDeleted = await ctx.storage.delete(storageId)
        .then(() => true)
        .catch(() => false);
      if (storageDeleted && registered) {
        const metadataRemoved = await ctx.runMutation(internal.emailAssets.discardStored, { storageId })
          .then(() => true)
          .catch(() => false);
        if (!metadataRemoved && ownerId) {
          await ctx.runMutation(internal.emailAssets.retainForCleanup, { ownerId, storageId, fileName }).catch(() => undefined);
        }
      } else if (storageDeleted && ownerId) {
        await ctx.runMutation(internal.emailAssets.retainForCleanup, { ownerId, storageId, fileName }).catch(() => undefined);
      } else if (!storageDeleted && ownerId) {
        await ctx.runMutation(internal.emailAssets.retainForCleanup, { ownerId, storageId, fileName }).catch(() => undefined);
      }
    }
    const message = safeError(error);
    const status = message.includes("1 MB") ? 413
      : message.includes("origin") ? 403
        : 400;
    return response(status, { error: message });
  }
});
