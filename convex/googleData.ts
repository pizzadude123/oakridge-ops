import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { requireUserId } from "./lib/requireUser";

export const status = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const connection = await ctx.db
      .query("googleConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    if (!connection) return { connected: false as const };
    return {
      connected: connection.status === "connected",
      status: connection.status,
      email: connection.email,
      displayName: connection.displayName,
      connectedAt: connection.connectedAt,
      lastError: connection.lastError,
    };
  },
});

export const createAuthAttempt = internalMutation({
  args: {
    ownerId: v.id("users"),
    stateHash: v.string(),
    encryptedCodeVerifier: v.string(),
    codeVerifierIv: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("googleOAuthAttempts")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect();
    for (const attempt of existing) await ctx.db.delete(attempt._id);
    return await ctx.db.insert("googleOAuthAttempts", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const consumeAuthAttempt = internalMutation({
  args: { stateHash: v.string() },
  handler: async (ctx, args) => {
    const attempt = await ctx.db
      .query("googleOAuthAttempts")
      .withIndex("by_state_hash", (q) => q.eq("stateHash", args.stateHash))
      .unique();
    if (!attempt || attempt.consumedAt) throw new Error("Google authorization state is invalid or already used.");
    if (attempt.expiresAt < Date.now()) throw new Error("Google authorization expired. Start the connection again.");
    await ctx.db.patch(attempt._id, { consumedAt: Date.now() });
    return attempt;
  },
});

export const connectionForSend = internalQuery({
  args: { ownerId: v.id("users") },
  handler: async (ctx, args) => await ctx.db
    .query("googleConnections")
    .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
    .unique(),
});

export const completeConnection = internalMutation({
  args: {
    ownerId: v.id("users"),
    encryptedRefreshToken: v.string(),
    refreshTokenIv: v.string(),
    googleUserId: v.string(),
    email: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("googleConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .unique();
    const now = Date.now();
    const fields = {
      status: "connected" as const,
      encryptedRefreshToken: args.encryptedRefreshToken,
      refreshTokenIv: args.refreshTokenIv,
      googleUserId: args.googleUserId,
      email: args.email.toLocaleLowerCase(),
      displayName: args.displayName,
      connectedAt: now,
      lastError: undefined,
      updatedAt: now,
    };
    if (connection) await ctx.db.patch(connection._id, fields);
    else await ctx.db.insert("googleConnections", { ownerId: args.ownerId, ...fields });
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
      .query("googleConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .unique();
    if (!connection) throw new Error("Google account is not connected.");
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
      .query("googleConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .unique();
    if (connection?.status === "connected") {
      await ctx.db.patch(connection._id, { lastError: args.message, updatedAt: Date.now() });
    } else if (connection) {
      await ctx.db.patch(connection._id, { status: "error", lastError: args.message, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("googleConnections", { ownerId: args.ownerId, status: "error", lastError: args.message, updatedAt: Date.now() });
    }
  },
});

export const markReauthorizationRequired = internalMutation({
  args: { ownerId: v.id("users"), message: v.string() },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("googleConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .unique();
    if (connection) await ctx.db.patch(connection._id, { status: "reauthorization_required", lastError: args.message, updatedAt: Date.now() });
  },
});

export const removeConnection = internalMutation({
  args: { ownerId: v.id("users") },
  handler: async (ctx, args) => {
    const [connection, attempts] = await Promise.all([
      ctx.db.query("googleConnections").withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId)).unique(),
      ctx.db.query("googleOAuthAttempts").withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId)).collect(),
    ]);
    for (const attempt of attempts) await ctx.db.delete(attempt._id);
    if (connection) await ctx.db.delete(connection._id);
  },
});
