import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const paymentStatus = v.union(
  v.literal("reported_paid"),
  v.literal("unpaid"),
  v.literal("pending"),
  v.literal("needs_review"),
);
const replyStatus = v.union(
  v.literal("awaiting_reply"),
  v.literal("replied"),
  v.literal("not_contacted"),
);

export default defineSchema({
  ...authTables,
  contacts: defineTable({
    ownerId: v.id("users"),
    fullName: v.string(),
    email: v.string(),
    school: v.string(),
    department: v.string(),
    paymentStatus,
    replyStatus,
    tags: v.array(v.string()),
    preference1: v.optional(v.string()),
    preference2: v.optional(v.string()),
    preference3: v.optional(v.string()),
    assignedCommittee: v.optional(v.string()),
    assignedAllocation: v.optional(v.string()),
    registeredAt: v.optional(v.string()),
    source: v.string(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_email", ["ownerId", "email"]),
  routingRules: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    department: v.string(),
    keywords: v.array(v.string()),
    recipients: v.array(v.string()),
    enabled: v.boolean(),
    priority: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
  messages: defineTable({
    ownerId: v.id("users"),
    contactId: v.optional(v.id("contacts")),
    recipientEmail: v.string(),
    recipientName: v.string(),
    senderEmail: v.string(),
    subject: v.string(),
    bodyHtml: v.string(),
    bodyText: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("opened_in_gmail"),
      v.literal("sent"),
      v.literal("failed"),
    ),
    sentAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_status", ["ownerId", "status"]),
  imports: defineTable({
    ownerId: v.id("users"),
    kind: v.union(v.literal("registrations"), v.literal("allocations")),
    fileName: v.string(),
    rowCount: v.number(),
    issueCount: v.number(),
    summary: v.string(),
    importedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
  registrations: defineTable({
    ownerId: v.id("users"),
    fullName: v.string(),
    email: v.string(),
    school: v.string(),
    registeredAt: v.string(),
    paymentStatus,
    preference1: v.string(),
    preference2: v.string(),
    preference3: v.string(),
    importFile: v.string(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
  allocationRows: defineTable({
    ownerId: v.id("users"),
    sheet: v.string(),
    seatNumber: v.string(),
    allocation: v.string(),
    delegateName: v.string(),
    schoolName: v.string(),
    importFile: v.string(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
  settings: defineTable({
    ownerId: v.id("users"),
    gmailSender: v.string(),
    workspaceName: v.string(),
    initializedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
});
