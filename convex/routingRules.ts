import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/requireUser";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    return await ctx.db
      .query("routingRules")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
  },
});

export const save = mutation({
  args: {
    id: v.optional(v.id("routingRules")),
    name: v.string(),
    department: v.string(),
    keywords: v.array(v.string()),
    recipients: v.array(v.string()),
    enabled: v.boolean(),
    priority: v.number(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const { id, ...fields } = args;
    const value = { ...fields, ownerId, updatedAt: Date.now() };
    if (id) {
      const existing = await ctx.db.get(id);
      if (!existing || existing.ownerId !== ownerId) throw new Error("Rule not found.");
      await ctx.db.patch(id, value);
      return id;
    }
    return await ctx.db.insert("routingRules", value);
  },
});
