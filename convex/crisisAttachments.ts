import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { canManageExperienceRecord, isCrisisAttachmentPublic } from "./lib/experienceAccess";
import {
  deleteStoredAttachmentSafely,
  isUnattachedCrisisAttachmentExpired,
  validateCrisisAttachmentFileName,
  validateCrisisAttachmentMetadata,
  validateCrisisAttachmentOwnerQuota,
} from "./lib/crisisAttachments";
import { requireAuthenticatedStaff } from "./lib/requireUser";

export const registerStored = internalMutation({
  args: {
    ownerId: v.id("users"),
    storageId: v.id("_storage"),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) throw new Error("The uploaded attachment is unavailable. Upload it again.");
    const validated = validateCrisisAttachmentMetadata(metadata);
    const existing = await ctx.db
      .query("crisisAttachments")
      .withIndex("by_storage", (query) => query.eq("storageId", args.storageId))
      .unique();
    if (existing) {
      if (existing.ownerId !== args.ownerId) throw new Error("This attachment is not available to your workspace.");
      return { id: existing._id, fileName: existing.fileName, contentType: existing.contentType, size: existing.size };
    }

    const now = Date.now();
    const retained = await ctx.db
      .query("crisisAttachments")
      .withIndex("by_owner", (query) => query.eq("ownerId", args.ownerId))
      .collect();
    const active = [];
    for (const attachment of retained) {
      if (!isUnattachedCrisisAttachmentExpired(attachment.createdAt, attachment.updateId ? String(attachment.updateId) : undefined, now)) {
        active.push(attachment);
        continue;
      }
      const reverseReference = await ctx.db
        .query("crisisUpdates")
        .withIndex("by_attachment", (query) => query.eq("attachmentId", attachment._id))
        .first();
      if (reverseReference) {
        active.push(attachment);
        continue;
      }
      const deleted = await deleteStoredAttachmentSafely(
        () => ctx.storage.delete(attachment.storageId),
        () => ctx.db.delete(attachment._id),
      );
      if (!deleted) active.push(attachment);
    }
    validateCrisisAttachmentOwnerQuota(active, validated.size);
    const fileName = validateCrisisAttachmentFileName(args.fileName, validated.contentType);
    const id = await ctx.db.insert("crisisAttachments", {
      ownerId: args.ownerId,
      storageId: args.storageId,
      fileName,
      contentType: validated.contentType,
      size: validated.size,
      sha256: metadata.sha256,
      createdAt: now,
    });
    return { id, fileName, contentType: validated.contentType, size: validated.size };
  },
});

export const discardStored = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("crisisAttachments")
      .withIndex("by_storage", (query) => query.eq("storageId", args.storageId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return { removed: Boolean(existing) };
  },
});

export const retainForCleanup = internalMutation({
  args: {
    ownerId: v.id("users"),
    storageId: v.id("_storage"),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("crisisAttachments")
      .withIndex("by_storage", (query) => query.eq("storageId", args.storageId))
      .unique();
    if (existing) {
      if (existing.ownerId !== args.ownerId) throw new Error("This attachment is not available to your workspace.");
      await ctx.db.patch(existing._id, { createdAt: 0 });
      return { tracked: true };
    }
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) return { tracked: false };
    const validated = validateCrisisAttachmentMetadata(metadata);
    await ctx.db.insert("crisisAttachments", {
      ownerId: args.ownerId,
      storageId: args.storageId,
      fileName: validateCrisisAttachmentFileName(args.fileName, validated.contentType),
      contentType: validated.contentType,
      size: validated.size,
      sha256: metadata.sha256,
      createdAt: 0,
    });
    return { tracked: true };
  },
});

export const pruneExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const unattached = await ctx.db
      .query("crisisAttachments")
      .withIndex("by_update", (query) => query.eq("updateId", undefined))
      .collect();
    let removed = 0;
    let failed = 0;
    for (const attachment of unattached) {
      if (!isUnattachedCrisisAttachmentExpired(attachment.createdAt, undefined, now)) continue;
      const reverseReference = await ctx.db
        .query("crisisUpdates")
        .withIndex("by_attachment", (query) => query.eq("attachmentId", attachment._id))
        .first();
      if (reverseReference) {
        failed += 1;
        continue;
      }
      const deleted = await deleteStoredAttachmentSafely(
        () => ctx.storage.delete(attachment.storageId),
        () => ctx.db.delete(attachment._id),
      );
      if (deleted) removed += 1;
      else failed += 1;
    }
    return { removed, failed };
  },
});

export const publicDownloadRecord = internalQuery({
  args: { id: v.id("crisisAttachments") },
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.id);
    if (!attachment?.updateId) return null;
    const update = await ctx.db.get(attachment.updateId);
    if (!update
      || update.attachmentId !== attachment._id
      || !isCrisisAttachmentPublic(update.isPublished, String(update._id), String(attachment.updateId))) {
      return null;
    }
    return {
      storageId: attachment.storageId,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      size: attachment.size,
    };
  },
});

export const remove = mutation({
  args: { id: v.id("crisisAttachments") },
  handler: async (ctx, args) => {
    const staff = await requireAuthenticatedStaff(ctx);
    const attachment = await ctx.db.get(args.id);
    if (!attachment || !canManageExperienceRecord(staff.role, staff.userId, attachment.ownerId)) {
      throw new Error("This crisis attachment is unavailable.");
    }
    if (attachment.updateId) throw new Error("Remove a published or saved attachment by editing its crisis update.");
    await ctx.storage.delete(attachment.storageId);
    await ctx.db.delete(attachment._id);
    return { removed: true };
  },
});
