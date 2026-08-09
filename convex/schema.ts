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
    provider: v.optional(v.union(v.literal("gmail_compose"), v.literal("google_gmail"), v.literal("microsoft_graph"))),
    batchId: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
    providerError: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("opened_in_gmail"),
      v.literal("sending"),
      v.literal("accepted"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("unknown"),
    ),
    attemptCount: v.optional(v.number()),
    lastAttemptAt: v.optional(v.number()),
    providerAcceptedAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_owner_batch_contact", ["ownerId", "batchId", "contactId"])
    .index("by_owner_provider_batch_contact", ["ownerId", "provider", "batchId", "contactId"]),
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
  workbookConnections: defineTable({
    ownerId: v.id("users"),
    status: v.union(v.literal("connected"), v.literal("syncing"), v.literal("error")),
    driveId: v.string(),
    itemId: v.string(),
    fileName: v.string(),
    webUrl: v.optional(v.string()),
    eTag: v.optional(v.string()),
    lastModifiedAt: v.optional(v.string()),
    connectedAt: v.number(),
    lastCheckedAt: v.optional(v.number()),
    nextCheckAt: v.optional(v.number()),
    lastChangedAt: v.optional(v.number()),
    totalSeats: v.optional(v.number()),
    occupiedSeats: v.optional(v.number()),
    issueCount: v.optional(v.number()),
    newIssueCount: v.optional(v.number()),
    resolvedIssueCount: v.optional(v.number()),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_status", ["status"]),
  workbookIssues: defineTable({
    ownerId: v.id("users"),
    connectionId: v.id("workbookConnections"),
    issueKey: v.string(),
    type: v.union(v.literal("Double allocation"), v.literal("Duplicate seat"), v.literal("School missing")),
    severity: v.union(v.literal("error"), v.literal("warning")),
    delegate: v.string(),
    location: v.string(),
    action: v.string(),
    status: v.union(v.literal("new"), v.literal("ongoing"), v.literal("resolved")),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_connection", ["connectionId"])
    .index("by_connection_key", ["connectionId", "issueKey"]),
  workbookAlerts: defineTable({
    ownerId: v.id("users"),
    connectionId: v.id("workbookConnections"),
    kind: v.union(v.literal("new_issues"), v.literal("resolved_issues"), v.literal("sync_error")),
    message: v.string(),
    issueCount: v.number(),
    createdAt: v.number(),
    acknowledgedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_created", ["ownerId", "createdAt"]),
  settings: defineTable({
    ownerId: v.id("users"),
    gmailSender: v.string(),
    workspaceName: v.string(),
    initializedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
  graphOAuthAttempts: defineTable({
    ownerId: v.id("users"),
    stateHash: v.string(),
    encryptedCodeVerifier: v.string(),
    codeVerifierIv: v.string(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_state_hash", ["stateHash"]),
  graphConnections: defineTable({
    ownerId: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("connected"), v.literal("reauthorization_required"), v.literal("error")),
    syncState: v.union(v.literal("idle"), v.literal("syncing"), v.literal("error")),
    pendingState: v.optional(v.string()),
    encryptedCodeVerifier: v.optional(v.string()),
    codeVerifierIv: v.optional(v.string()),
    stateExpiresAt: v.optional(v.number()),
    encryptedRefreshToken: v.optional(v.string()),
    refreshTokenIv: v.optional(v.string()),
    microsoftUserId: v.optional(v.string()),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    connectedAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    nextSyncAt: v.optional(v.number()),
    messageCount: v.optional(v.number()),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_state", ["pendingState"]),
  googleOAuthAttempts: defineTable({
    ownerId: v.id("users"),
    stateHash: v.string(),
    encryptedCodeVerifier: v.string(),
    codeVerifierIv: v.string(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_state_hash", ["stateHash"]),
  googleConnections: defineTable({
    ownerId: v.id("users"),
    status: v.union(v.literal("connected"), v.literal("reauthorization_required"), v.literal("error")),
    encryptedRefreshToken: v.optional(v.string()),
    refreshTokenIv: v.optional(v.string()),
    googleUserId: v.optional(v.string()),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    connectedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
  inboxMessages: defineTable({
    ownerId: v.id("users"),
    graphId: v.string(),
    subject: v.string(),
    senderName: v.string(),
    senderAddress: v.string(),
    receivedAt: v.string(),
    isRead: v.boolean(),
    preview: v.string(),
    webLink: v.optional(v.string()),
    routeRuleName: v.optional(v.string()),
    routeDepartment: v.optional(v.string()),
    routeRecipients: v.array(v.string()),
    syncedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_graph_id", ["ownerId", "graphId"])
    .index("by_owner_received", ["ownerId", "receivedAt"]),
});
