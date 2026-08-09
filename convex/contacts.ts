import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/requireUser";

const contactFields = {
  fullName: v.string(),
  email: v.string(),
  school: v.string(),
  department: v.string(),
  paymentStatus: v.union(
    v.literal("reported_paid"),
    v.literal("unpaid"),
    v.literal("pending"),
    v.literal("needs_review"),
  ),
  replyStatus: v.union(
    v.literal("awaiting_reply"),
    v.literal("replied"),
    v.literal("not_contacted"),
  ),
  tags: v.array(v.string()),
  preference1: v.optional(v.string()),
  preference2: v.optional(v.string()),
  preference3: v.optional(v.string()),
  assignedCommittee: v.optional(v.string()),
  assignedAllocation: v.optional(v.string()),
  registeredAt: v.optional(v.string()),
  source: v.string(),
};

function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase();
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    return await ctx.db
      .query("contacts")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
  },
});

export const forMailSend = internalQuery({
  args: { ownerId: v.id("users"), contactIds: v.array(v.id("contacts")) },
  handler: async (ctx, args) => {
    const contacts = [];
    for (const id of args.contactIds) {
      const contact = await ctx.db.get(id);
      if (!contact || contact.ownerId !== args.ownerId) throw new Error("One or more email recipients are unavailable.");
      contacts.push(contact);
    }
    return contacts;
  },
});

export const upsert = mutation({
  args: contactFields,
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const email = normalizeEmail(args.email);
    if (!email.includes("@")) throw new Error("Enter a valid email address.");
    const existing = await ctx.db
      .query("contacts")
      .withIndex("by_owner_email", (q) => q.eq("ownerId", ownerId).eq("email", email))
      .unique();
    const value = { ...args, email, ownerId, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, value);
      return { id: existing._id, created: false };
    }
    return { id: await ctx.db.insert("contacts", value), created: true };
  },
});

export const importPeople = mutation({
  args: {
    fileName: v.string(),
    people: v.array(v.object({ fullName: v.string(), email: v.string(), school: v.string() })),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    if (!args.people.length || args.people.length > 1000) throw new Error("Import between 1 and 1,000 people at a time.");
    const contactIds = [];
    let created = 0;
    let updated = 0;
    for (const person of args.people) {
      const email = normalizeEmail(person.email);
      if (!email.includes("@")) continue;
      const existing = await ctx.db
        .query("contacts")
        .withIndex("by_owner_email", (q) => q.eq("ownerId", ownerId).eq("email", email))
        .unique();
      const now = Date.now();
      if (existing) {
        await ctx.db.patch(existing._id, {
          fullName: person.fullName || existing.fullName,
          school: person.school || existing.school,
          source: `email_import:${args.fileName}`,
          updatedAt: now,
        });
        contactIds.push(existing._id);
        updated += 1;
      } else {
        const id = await ctx.db.insert("contacts", {
          ownerId,
          fullName: person.fullName,
          email,
          school: person.school,
          department: "",
          paymentStatus: "pending",
          replyStatus: "not_contacted",
          tags: ["excel-import"],
          source: `email_import:${args.fileName}`,
          updatedAt: now,
        });
        contactIds.push(id);
        created += 1;
      }
    }
    return { contactIds, created, updated };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("contacts"),
    paymentStatus: v.optional(contactFields.paymentStatus),
    replyStatus: v.optional(contactFields.replyStatus),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const contact = await ctx.db.get(args.id);
    if (!contact || contact.ownerId !== ownerId) throw new Error("Contact not found.");
    await ctx.db.patch(args.id, {
      ...(args.paymentStatus ? { paymentStatus: args.paymentStatus } : {}),
      ...(args.replyStatus ? { replyStatus: args.replyStatus } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("contacts") },
  handler: async (ctx, { id }) => {
    const ownerId = await requireUserId(ctx);
    const contact = await ctx.db.get(id);
    if (!contact || contact.ownerId !== ownerId) throw new Error("Contact not found.");
    await ctx.db.delete(id);
  },
});
