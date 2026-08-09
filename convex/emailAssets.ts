import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { isEmailAssetExpired, validateEmailAssetMetadata, validateEmailAssetOwnerQuota } from "./lib/emailAssets";

function cleanFileName(value: string) {
  const clean = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return clean.slice(0, 160) || "Email image";
}

export const registerStored = internalMutation({
  args: {
    ownerId: v.id("users"),
    storageId: v.id("_storage"),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) throw new Error("The uploaded image is unavailable. Upload it again.");
    const validated = validateEmailAssetMetadata(metadata);
    const existing = await ctx.db
      .query("emailAssets")
      .withIndex("by_storage", (query) => query.eq("storageId", args.storageId))
      .unique();
    if (existing) {
      if (existing.ownerId !== args.ownerId) throw new Error("This uploaded image is not available to your workspace.");
      return { id: existing._id, fileName: existing.fileName, contentType: existing.contentType, size: existing.size };
    }
    const now = Date.now();
    const retained = await ctx.db
      .query("emailAssets")
      .withIndex("by_owner", (query) => query.eq("ownerId", args.ownerId))
      .collect();
    const active = [];
    for (const asset of retained) {
      if (!isEmailAssetExpired(asset.createdAt, now)) {
        active.push(asset);
        continue;
      }
      await ctx.storage.delete(asset.storageId).catch(() => undefined);
      await ctx.db.delete(asset._id);
    }
    validateEmailAssetOwnerQuota(active, validated.size);
    const id = await ctx.db.insert("emailAssets", {
      ownerId: args.ownerId,
      storageId: args.storageId,
      fileName: cleanFileName(args.fileName),
      contentType: validated.contentType,
      size: validated.size,
      sha256: metadata.sha256,
      createdAt: now,
    });
    return { id, fileName: cleanFileName(args.fileName), contentType: validated.contentType, size: validated.size };
  },
});

export const discardStored = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("emailAssets")
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
      .query("emailAssets")
      .withIndex("by_storage", (query) => query.eq("storageId", args.storageId))
      .unique();
    if (existing) {
      if (existing.ownerId !== args.ownerId) throw new Error("This uploaded image is not available to your workspace.");
      await ctx.db.patch(existing._id, { createdAt: 0 });
      return { tracked: true };
    }
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) return { tracked: false };
    const validated = validateEmailAssetMetadata(metadata);
    await ctx.db.insert("emailAssets", {
      ownerId: args.ownerId,
      storageId: args.storageId,
      fileName: cleanFileName(args.fileName),
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
    const candidates = await ctx.db.query("emailAssets").order("asc").take(100);
    let removed = 0;
    for (const asset of candidates) {
      if (!isEmailAssetExpired(asset.createdAt, now)) continue;
      await ctx.storage.delete(asset.storageId);
      await ctx.db.delete(asset._id);
      removed += 1;
    }
    return { removed };
  },
});

export const remove = mutation({
  args: { id: v.id("emailAssets") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Sign in before removing email images.");
    const asset = await ctx.db.get(args.id);
    if (!asset || asset.ownerId !== ownerId) throw new Error("This email image is unavailable.");
    await ctx.storage.delete(asset.storageId);
    await ctx.db.delete(asset._id);
    return { removed: true };
  },
});

export const forSend = internalQuery({
  args: {
    ownerId: v.id("users"),
    assetIds: v.array(v.id("emailAssets")),
  },
  handler: async (ctx, args) => {
    const assets = await Promise.all(args.assetIds.map((id) => ctx.db.get(id)));
    if (assets.some((asset) => !asset || asset.ownerId !== args.ownerId)) {
      throw new Error("One or more email images are unavailable. No emails were sent.");
    }
    return assets.map((asset) => asset!);
  },
});
