import { getAuthUserId } from "@convex-dev/auth/server";
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
    for (const message of messages) await ctx.db.delete(message._id);
    if (connection) await ctx.db.delete(connection._id);
    return { deletedMessages: messages.length };
  },
});

export const beginConnection = internalMutation({
  args: {
    ownerId: v.id("users"),
    pendingState: v.string(),
    encryptedCodeVerifier: v.string(),
    codeVerifierIv: v.string(),
    stateExpiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("graphConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .unique();
    const fields = {
      status: "pending" as const,
      syncState: "idle" as const,
      pendingState: args.pendingState,
      encryptedCodeVerifier: args.encryptedCodeVerifier,
      codeVerifierIv: args.codeVerifierIv,
      stateExpiresAt: args.stateExpiresAt,
      lastError: undefined,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("graphConnections", { ownerId: args.ownerId, ...fields });
  },
});

export const pendingByState = internalQuery({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("graphConnections")
      .withIndex("by_state", (q) => q.eq("pendingState", args.state))
      .unique();
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
    if (!connection) throw new Error("Microsoft connection was not started.");
    const now = Date.now();
    await ctx.db.patch(connection._id, {
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
    if (!connection) return;
    await ctx.db.patch(connection._id, {
      status: "error",
      syncState: "error",
      lastError: args.message,
      pendingState: undefined,
      encryptedCodeVerifier: undefined,
      codeVerifierIv: undefined,
      stateExpiresAt: undefined,
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

export const authenticatedOwnerId = internalQuery({
  args: {},
  handler: async (ctx) => await getAuthUserId(ctx),
});
