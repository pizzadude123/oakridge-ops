import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
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
      provider: "gmail_compose",
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

export const batchResults = internalQuery({
  args: { ownerId: v.id("users"), batchId: v.string() },
  handler: async (ctx, args) => await ctx.db
    .query("messages")
    .withIndex("by_owner_batch_contact", (q) => q.eq("ownerId", args.ownerId).eq("batchId", args.batchId))
    .collect(),
});

export const recordProviderResult = internalMutation({
  args: {
    ownerId: v.id("users"),
    contactId: v.id("contacts"),
    batchId: v.string(),
    recipientEmail: v.string(),
    recipientName: v.string(),
    senderEmail: v.string(),
    subject: v.string(),
    bodyHtml: v.string(),
    bodyText: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    providerError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_owner_batch_contact", (q) => q
        .eq("ownerId", args.ownerId)
        .eq("batchId", args.batchId)
        .eq("contactId", args.contactId))
      .unique();
    const now = Date.now();
    const fields = {
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      senderEmail: args.senderEmail,
      subject: args.subject,
      bodyHtml: args.bodyHtml,
      bodyText: args.bodyText,
      provider: "microsoft_graph" as const,
      status: args.status,
      providerError: args.providerError,
      sentAt: args.status === "sent" ? now : undefined,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("messages", {
      ownerId: args.ownerId,
      contactId: args.contactId,
      batchId: args.batchId,
      createdAt: now,
      ...fields,
    });
  },
});
