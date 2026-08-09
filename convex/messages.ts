import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { canClaimProviderDelivery, canManuallyChangeStatus } from "./lib/mailDelivery";
import { requireUserId } from "./lib/requireUser";

const manualMessageStatus = v.union(
  v.literal("draft"),
  v.literal("opened_in_gmail"),
  v.literal("sent"),
);
const sendingProvider = v.union(v.literal("google_gmail"), v.literal("microsoft_graph"));
const providerResultStatus = v.union(v.literal("accepted"), v.literal("failed"), v.literal("unknown"));

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
      senderEmail: "cattartzz@gmail.com",
      provider: "gmail_compose",
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const markStatus = mutation({
  args: { id: v.id("messages"), status: manualMessageStatus },
  handler: async (ctx, { id, status }) => {
    const ownerId = await requireUserId(ctx);
    const message = await ctx.db.get(id);
    if (!message || message.ownerId !== ownerId) throw new Error("Message not found.");
    if (!canManuallyChangeStatus(message.provider, status)) throw new Error("Provider delivery results cannot be changed manually.");
    await ctx.db.patch(id, {
      status,
      ...(status === "sent" ? { sentAt: Date.now() } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const batchResults = internalQuery({
  args: { ownerId: v.id("users"), provider: sendingProvider, batchId: v.string() },
  handler: async (ctx, args) => await ctx.db
    .query("messages")
    .withIndex("by_owner_provider_batch_contact", (q) => q
      .eq("ownerId", args.ownerId)
      .eq("provider", args.provider)
      .eq("batchId", args.batchId))
    .collect(),
});

export const claimProviderDelivery = internalMutation({
  args: {
    ownerId: v.id("users"),
    contactId: v.id("contacts"),
    batchId: v.string(),
    recipientEmail: v.string(),
    recipientName: v.string(),
    senderEmail: v.string(),
    provider: sendingProvider,
    subject: v.string(),
    bodyHtml: v.string(),
    bodyText: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_owner_provider_batch_contact", (q) => q
        .eq("ownerId", args.ownerId)
        .eq("provider", args.provider)
        .eq("batchId", args.batchId)
        .eq("contactId", args.contactId))
      .unique();
    const now = Date.now();
    if (existing && !canClaimProviderDelivery(existing.status)) {
      return { claimed: false as const, status: existing.status };
    }
    const fields = {
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      senderEmail: args.senderEmail,
      subject: args.subject,
      bodyHtml: args.bodyHtml,
      bodyText: args.bodyText,
      provider: args.provider,
      providerMessageId: undefined,
      status: "sending" as const,
      providerError: undefined,
      attemptCount: (existing?.attemptCount ?? 0) + 1,
      lastAttemptAt: now,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return { claimed: true as const, id: existing._id };
    }
    const id = await ctx.db.insert("messages", {
      ownerId: args.ownerId,
      contactId: args.contactId,
      batchId: args.batchId,
      createdAt: now,
      ...fields,
    });
    return { claimed: true as const, id };
  },
});

export const finalizeProviderDelivery = internalMutation({
  args: {
    ownerId: v.id("users"),
    contactId: v.id("contacts"),
    batchId: v.string(),
    provider: sendingProvider,
    status: providerResultStatus,
    providerMessageId: v.optional(v.string()),
    providerError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_owner_provider_batch_contact", (q) => q
        .eq("ownerId", args.ownerId)
        .eq("provider", args.provider)
        .eq("batchId", args.batchId)
        .eq("contactId", args.contactId))
      .unique();
    if (!existing) throw new Error("Provider delivery was not claimed.");
    if (existing.status !== "sending") return existing._id;
    const now = Date.now();
    await ctx.db.patch(existing._id, {
      status: args.status,
      providerMessageId: args.providerMessageId,
      providerError: args.providerError,
      providerAcceptedAt: args.status === "accepted" ? now : undefined,
      updatedAt: now,
    });
    return existing._id;
  },
});
