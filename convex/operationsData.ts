import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/requireUser";

const paymentStatus = v.union(
  v.literal("reported_paid"),
  v.literal("unpaid"),
  v.literal("pending"),
  v.literal("needs_review"),
);

const registrationRow = v.object({
  responseId: v.optional(v.string()),
  fullName: v.string(),
  email: v.string(),
  school: v.string(),
  registeredAt: v.string(),
  startedAt: v.optional(v.string()),
  submittedAt: v.optional(v.string()),
  paymentStatus,
  preference1: v.string(),
  preference2: v.string(),
  preference3: v.string(),
  answers: v.optional(v.array(v.object({ question: v.string(), answer: v.string() }))),
});

const allocationRow = v.object({
  sheet: v.string(),
  seatNumber: v.string(),
  allocation: v.string(),
  delegateName: v.string(),
  schoolName: v.string(),
});

export const registrations = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    return await ctx.db
      .query("registrations")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
  },
});

export const allocations = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    return await ctx.db
      .query("allocationRows")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
  },
});

export const replaceRegistrations = mutation({
  args: {
    fileName: v.string(),
    rows: v.array(registrationRow),
  },
  handler: async (ctx, { fileName, rows }) => {
    const ownerId = await requireUserId(ctx);
    if (rows.length === 0) throw new Error("Import at least one registration. Existing registrations were not changed.");
    if (rows.length > 1500) throw new Error("Import at most 1,500 registrations at once.");
    const existingRows = await ctx.db
      .query("registrations")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    for (const row of existingRows) await ctx.db.delete(row._id);

    const now = Date.now();
    let contactCount = 0;
    for (const row of rows) {
      await ctx.db.insert("registrations", {
        ...row,
        email: row.email.trim().toLocaleLowerCase(),
        ownerId,
        importFile: fileName,
        updatedAt: now,
      });
      const email = row.email.trim().toLocaleLowerCase();
      if (!email.includes("@")) continue;
      const contact = await ctx.db
        .query("contacts")
        .withIndex("by_owner_email", (q) => q.eq("ownerId", ownerId).eq("email", email))
        .unique();
      const fields = {
        fullName: row.fullName,
        email,
        school: row.school,
        department: "Delegates",
        paymentStatus: row.paymentStatus,
        preference1: row.preference1 || undefined,
        preference2: row.preference2 || undefined,
        preference3: row.preference3 || undefined,
        registeredAt: row.registeredAt || undefined,
        source: `Form import: ${fileName}`,
        updatedAt: now,
      };
      if (contact) {
        await ctx.db.patch(contact._id, fields);
      } else {
        await ctx.db.insert("contacts", {
          ...fields,
          ownerId,
          replyStatus: "not_contacted",
          tags: ["registration-import"],
        });
      }
      contactCount += 1;
    }

    await ctx.db.insert("imports", {
      ownerId,
      kind: "registrations",
      fileName,
      rowCount: rows.length,
      issueCount: rows.filter((row) => !row.fullName || !row.email).length,
      summary: `${rows.length} registrations imported; ${contactCount} contacts synchronized.`,
      importedAt: now,
    });
    return { rowCount: rows.length, contactCount };
  },
});

export const applyRecommendedCommittees = mutation({
  args: {
    assignments: v.array(v.object({ email: v.string(), committee: v.string() })),
  },
  handler: async (ctx, { assignments }) => {
    const ownerId = await requireUserId(ctx);
    if (assignments.length > 1500) throw new Error("Apply at most 1,500 assignments at once.");
    let updatedCount = 0;
    for (const assignment of assignments) {
      const email = assignment.email.trim().toLocaleLowerCase();
      const committee = assignment.committee.trim();
      if (!email.includes("@") || !committee) continue;
      const contact = await ctx.db
        .query("contacts")
        .withIndex("by_owner_email", (q) => q.eq("ownerId", ownerId).eq("email", email))
        .unique();
      if (!contact) continue;
      await ctx.db.patch(contact._id, { assignedCommittee: committee, updatedAt: Date.now() });
      updatedCount += 1;
    }
    return { updatedCount };
  },
});

export const replaceAllocations = mutation({
  args: {
    fileName: v.string(),
    issueCount: v.number(),
    rows: v.array(allocationRow),
  },
  handler: async (ctx, { fileName, issueCount, rows }) => {
    const ownerId = await requireUserId(ctx);
    if (rows.length === 0) throw new Error("Import at least one allocation row. Existing allocations were not changed.");
    if (rows.length > 2000) throw new Error("Import at most 2,000 allocation rows at once.");
    const existingRows = await ctx.db
      .query("allocationRows")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    for (const row of existingRows) await ctx.db.delete(row._id);

    const now = Date.now();
    for (const row of rows) {
      await ctx.db.insert("allocationRows", {
        ...row,
        ownerId,
        importFile: fileName,
        updatedAt: now,
      });
    }
    await ctx.db.insert("imports", {
      ownerId,
      kind: "allocations",
      fileName,
      rowCount: rows.length,
      issueCount,
      summary: `${rows.length} allocation seats analyzed; ${issueCount} issues need review.`,
      importedAt: now,
    });
    return { rowCount: rows.length, issueCount };
  },
});
