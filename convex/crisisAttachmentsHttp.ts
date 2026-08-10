import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import {
  validateCrisisAttachmentBytes,
  validateCrisisAttachmentMetadata,
  validateCrisisUploadHeaders,
} from "./lib/crisisAttachments";
import { requireAuthenticatedStaffAction } from "./lib/requireUser";

const registerStored = makeFunctionReference<"mutation", { ownerId: Id<"users">; storageId: Id<"_storage">; fileName: string }, { id: Id<"crisisAttachments">; fileName: string; contentType: string; size: number }>("crisisAttachments:registerStored");
const discardStored = makeFunctionReference<"mutation", { storageId: Id<"_storage"> }, { removed: boolean }>("crisisAttachments:discardStored");
const retainForCleanup = makeFunctionReference<"mutation", { ownerId: Id<"users">; storageId: Id<"_storage">; fileName: string }, { tracked: boolean }>("crisisAttachments:retainForCleanup");

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
  if (request.headers.get("Origin") !== allowedOrigin()) throw new Error("This upload origin is not allowed.");
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "The crisis attachment could not be uploaded.")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 300);
}

export const crisisAttachmentUploadOptions = httpAction(async (_ctx, request) => {
  try {
    requireAllowedOrigin(request);
    return new Response(null, { status: 204, headers: corsHeaders() });
  } catch (error) {
    return response(403, { error: safeError(error) });
  }
});

export const crisisAttachmentUpload = httpAction(async (ctx, request) => {
  let storageId: Awaited<ReturnType<typeof ctx.storage.store>> | null = null;
  let ownerId: Id<"users"> | null = null;
  let fileName = "Crisis attachment";
  let registered = false;
  try {
    requireAllowedOrigin(request);
    const staff = await requireAuthenticatedStaffAction(ctx, "Sign in before uploading crisis attachments.");
    ownerId = staff.userId;
    const { contentType, declaredSize } = validateCrisisUploadHeaders({
      contentLength: request.headers.get("Content-Length"),
      contentType: request.headers.get("Content-Type"),
    });
    const arrayBuffer = await request.arrayBuffer();
    const validated = validateCrisisAttachmentMetadata({ contentType, size: arrayBuffer.byteLength });
    if (declaredSize !== null && declaredSize !== validated.size) {
      throw new Error("The uploaded attachment size did not match the request.");
    }
    validateCrisisAttachmentBytes(new Uint8Array(arrayBuffer), validated.contentType);
    storageId = await ctx.storage.store(new Blob([arrayBuffer], { type: validated.contentType }));
    fileName = new URL(request.url).searchParams.get("filename") ?? "Crisis attachment";
    const attachment = await ctx.runMutation(registerStored, {
      ownerId,
      storageId,
      fileName,
    });
    registered = true;
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("The uploaded attachment is unavailable. Upload it again.");
    return response(201, { ...attachment, url });
  } catch (error) {
    if (storageId) {
      const storageDeleted = await ctx.storage.delete(storageId).then(() => true).catch(() => false);
      if (storageDeleted && registered) {
        const metadataRemoved = await ctx.runMutation(discardStored, { storageId }).then(() => true).catch(() => false);
        if (!metadataRemoved && ownerId) {
          await ctx.runMutation(retainForCleanup, { ownerId, storageId, fileName }).catch(() => undefined);
        }
      } else if (ownerId) {
        await ctx.runMutation(retainForCleanup, { ownerId, storageId, fileName }).catch(() => undefined);
      }
    }
    const message = safeError(error);
    const status = message.includes("10 MB") ? 413
      : message.includes("Sign in") ? 401
        : message.includes("origin") || message.includes("authorized") ? 403
          : 400;
    return response(status, { error: message });
  }
});
