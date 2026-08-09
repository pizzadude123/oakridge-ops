import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/requireUser";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    return await ctx.db
      .query("imports")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(25);
  },
});

export const record = mutation({
  args: {
    kind: v.union(v.literal("registrations"), v.literal("allocations")),
    fileName: v.string(),
    rowCount: v.number(),
    issueCount: v.number(),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    return await ctx.db.insert("imports", { ...args, ownerId, importedAt: Date.now() });
  },
});
