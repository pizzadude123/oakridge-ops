import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { routeInboxSubject } from "./lib/graphRouting";
import { requireUserId } from "./lib/requireUser";

const graphMessage = v.object({
  graphId: v.string(),
  subject: v.string(),
  senderName: v.string(),
  senderAddress: v.string(),
  receivedAt: v.string(),
  isRead: v.boolean(),
  preview: v.string(),
  webLink: v.optional(v.string()),
});

export const status = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const connection = await ctx.db
      .query("graphConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    if (!connection) return { connected: false as const };
    return {
      connected: connection.status === "connected",
      status: connection.status,
      syncState: connection.syncState,
      email: connection.email,
      displayName: connection.displayName,
      connectedAt: connection.connectedAt,
      lastSyncedAt: connection.lastSyncedAt,
      nextSyncAt: connection.nextSyncAt,
      messageCount: connection.messageCount ?? 0,
      lastError: connection.lastError,
    };
  },
});

export const listMessages = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const limit = Math.max(1, Math.min(args.limit ?? 75, 100));
    return await ctx.db
      .query("inboxMessages")
      .withIndex("by_owner_received", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(limit);
  },
});

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const connection = await ctx.db
      .query("graphConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    const messages = await ctx.db
      .query("inboxMessages")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const workbookConnection = await ctx.db
      .query("workbookConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    const attempts = await ctx.db
      .query("graphOAuthAttempts")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    for (const message of messages) await ctx.db.delete(message._id);
    if (workbookConnection) {
      const [issues, alerts] = await Promise.all([
        ctx.db.query("workbookIssues").withIndex("by_connection", (q) => q.eq("connectionId", workbookConnection._id)).collect(),
        ctx.db.query("workbookAlerts").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect(),
      ]);
      for (const issue of issues) await ctx.db.delete(issue._id);
      for (const alert of alerts) await ctx.db.delete(alert._id);
      await ctx.db.delete(workbookConnection._id);
    }
    for (const attempt of attempts) await ctx.db.delete(attempt._id);
    if (connection) await ctx.db.delete(connection._id);
    return { deletedMessages: messages.length };
  },
});

export const createAuthAttempt = internalMutation({
  args: {
    ownerId: v.id("users"),
    stateHash: v.string(),
    encryptedCodeVerifier: v.string(),
    codeVerifierIv: v.string(),
    returnTo: v.union(v.literal("email"), v.literal("inbox"), v.literal("excel")),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("graphOAuthAttempts")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect();
    for (const attempt of existing) await ctx.db.delete(attempt._id);
    return await ctx.db.insert("graphOAuthAttempts", { ...args, createdAt: Date.now() });
  },
});

export const consumeAuthAttempt = internalMutation({
  args: { stateHash: v.string() },
  handler: async (ctx, args) => {
    const attempt = await ctx.db
      .query("graphOAuthAttempts")
      .withIndex("by_state_hash", (q) => q.eq("stateHash", args.stateHash))
      .unique();
    if (!attempt || attempt.consumedAt) throw new Error("Microsoft authorization state is invalid or already used.");
    if (attempt.expiresAt < Date.now()) throw new Error("Microsoft authorization expired. Start the connection again.");
    await ctx.db.patch(attempt._id, { consumedAt: Date.now() });
    return attempt;
  },
});

export const connectionForSync = internalQuery({
  args: { ownerId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("graphConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .unique();
  },
});

export const connectedOwnerIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const connections = await ctx.db.query("graphConnections").collect();
    return connections
      .filter((connection) => connection.status === "connected" && connection.encryptedRefreshToken)
      .map((connection) => connection.ownerId);
  },
});

export const completeConnection = internalMutation({
  args: {
    ownerId: v.id("users"),
    encryptedRefreshToken: v.string(),
    refreshTokenIv: v.string(),
    microsoftUserId: v.string(),
    email: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("graphConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .unique();
    const now = Date.now();
    const fields = {
      status: "connected",
      syncState: "idle",
      encryptedRefreshToken: args.encryptedRefreshToken,
      refreshTokenIv: args.refreshTokenIv,
      microsoftUserId: args.microsoftUserId,
      email: args.email,
      displayName: args.displayName,
      connectedAt: now,
      lastError: undefined,
      pendingState: undefined,
      encryptedCodeVerifier: undefined,
      codeVerifierIv: undefined,
      stateExpiresAt: undefined,
      updatedAt: now,
    } as const;
    if (connection) await ctx.db.patch(connection._id, fields);
    else await ctx.db.insert("graphConnections", { ownerId: args.ownerId, ...fields });
  },
});

export const rotateRefreshToken = internalMutation({
  args: {
    ownerId: v.id("users"),
    encryptedRefreshToken: v.string(),
    refreshTokenIv: v.string(),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("graphConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .unique();
    if (!connection) throw new Error("Microsoft account is not connected.");
    await ctx.db.patch(connection._id, {
      encryptedRefreshToken: args.encryptedRefreshToken,
      refreshTokenIv: args.refreshTokenIv,
      updatedAt: Date.now(),
    });
  },
});

export const markConnectionError = internalMutation({
  args: { ownerId: v.id("users"), message: v.string() },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("graphConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .unique();
    if (connection?.status === "connected") {
      await ctx.db.patch(connection._id, { lastError: args.message, updatedAt: Date.now() });
    } else if (connection) {
      await ctx.db.patch(connection._id, { status: "error", syncState: "error", lastError: args.message, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("graphConnections", {
        ownerId: args.ownerId,
        status: "error",
        syncState: "error",
        lastError: args.message,
        updatedAt: Date.now(),
      });
    }
  },
});

export const markReauthorizationRequired = internalMutation({
  args: { ownerId: v.id("users"), message: v.string() },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("graphConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .unique();
    if (connection) await ctx.db.patch(connection._id, {
      status: "reauthorization_required",
      syncState: "error",
      lastError: args.message,
      updatedAt: Date.now(),
    });
  },
});

export const markSyncing = internalMutation({
  args: { ownerId: v.id("users") },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("graphConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .unique();
    if (connection) await ctx.db.patch(connection._id, { syncState: "syncing", lastError: undefined, updatedAt: Date.now() });
  },
});

export const markSyncError = internalMutation({
  args: { ownerId: v.id("users"), message: v.string() },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("graphConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .unique();
    if (connection) await ctx.db.patch(connection._id, { syncState: "error", lastError: args.message, updatedAt: Date.now() });
  },
});

export const storeSyncResults = internalMutation({
  args: {
    ownerId: v.id("users"),
    messages: v.array(graphMessage),
    rotatedRefreshToken: v.optional(v.object({ ciphertext: v.string(), iv: v.string() })),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("graphConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .unique();
    if (!connection) throw new Error("Microsoft inbox is not connected.");
    const rules = await ctx.db
      .query("routingRules")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect();
    const now = Date.now();
    for (const message of args.messages) {
      const matched = routeInboxSubject(message.subject, rules);
      const value = {
        ...message,
        ownerId: args.ownerId,
        routeRuleName: matched?.name,
        routeDepartment: matched?.department,
        routeRecipients: matched?.recipients ?? [],
        syncedAt: now,
      };
      const existing = await ctx.db
        .query("inboxMessages")
        .withIndex("by_owner_graph_id", (q) => q.eq("ownerId", args.ownerId).eq("graphId", message.graphId))
        .unique();
      if (existing) await ctx.db.patch(existing._id, value);
      else await ctx.db.insert("inboxMessages", value);
    }
    await ctx.db.patch(connection._id, {
      status: "connected",
      syncState: "idle",
      encryptedRefreshToken: args.rotatedRefreshToken?.ciphertext ?? connection.encryptedRefreshToken,
      refreshTokenIv: args.rotatedRefreshToken?.iv ?? connection.refreshTokenIv,
      lastSyncedAt: now,
      nextSyncAt: now + 2 * 60 * 60 * 1000,
      messageCount: args.messages.length,
      lastError: undefined,
      updatedAt: now,
    });
    return { synced: args.messages.length };
  },
});
