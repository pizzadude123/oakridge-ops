import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/requireUser";

const messageStatus = v.union(
  v.literal("draft"),
  v.literal("opened_in_gmail"),
  v.literal("sent"),
  v.literal("failed"),
);

export const recent = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    return (await ctx.db
      .query("messages")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(50));
  },
});

export const saveDraft = mutation({
  args: {
    contactId: v.optional(v.id("contacts")),
    recipientEmail: v.string(),
    recipientName: v.string(),
    subject: v.string(),
    bodyHtml: v.string(),
    bodyText: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const now = Date.now();
    return await ctx.db.insert("messages", {
      ...args,
      ownerId,
      senderEmail: "nagapranayimmadi@gmail.com",
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const markStatus = mutation({
  args: { id: v.id("messages"), status: messageStatus },
  handler: async (ctx, { id, status }) => {
    const ownerId = await requireUserId(ctx);
    const message = await ctx.db.get(id);
    if (!message || message.ownerId !== ownerId) throw new Error("Message not found.");
    await ctx.db.patch(id, {
      status,
      ...(status === "sent" ? { sentAt: Date.now() } : {}),
      updatedAt: Date.now(),
    });
  },
});
