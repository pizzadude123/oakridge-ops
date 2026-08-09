import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { diffWorkbookIssueKeys } from "./lib/workbookMonitor";
import { requireUserId } from "./lib/requireUser";

const allocationRow = v.object({
  sheet: v.string(),
  seatNumber: v.string(),
  allocation: v.string(),
  delegateName: v.string(),
  schoolName: v.string(),
});

const workbookIssue = v.object({
  key: v.string(),
  type: v.union(v.literal("Double allocation"), v.literal("Duplicate seat"), v.literal("School missing")),
  severity: v.union(v.literal("error"), v.literal("warning")),
  delegate: v.string(),
  location: v.string(),
  action: v.string(),
});

export const status = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const [connection, graphConnection, recentAlerts] = await Promise.all([
      ctx.db.query("workbookConnections").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).unique(),
      ctx.db.query("graphConnections").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).unique(),
      ctx.db.query("workbookAlerts").withIndex("by_owner_created", (q) => q.eq("ownerId", ownerId)).order("desc").take(20),
    ]);
    const unacknowledged = recentAlerts.filter((alert) => !alert.acknowledgedAt);
    if (!connection) {
      return {
        connected: false as const,
        microsoftConnected: graphConnection?.status === "connected",
        unacknowledgedAlerts: unacknowledged.length,
      };
    }
    return {
      connected: true as const,
      microsoftConnected: graphConnection?.status === "connected",
      id: connection._id,
      status: connection.status,
      fileName: connection.fileName,
      webUrl: connection.webUrl,
      connectedAt: connection.connectedAt,
      lastCheckedAt: connection.lastCheckedAt,
      nextCheckAt: connection.nextCheckAt,
      lastChangedAt: connection.lastChangedAt,
      lastModifiedAt: connection.lastModifiedAt,
      totalSeats: connection.totalSeats ?? 0,
      occupiedSeats: connection.occupiedSeats ?? 0,
      issueCount: connection.issueCount ?? 0,
      newIssueCount: connection.newIssueCount ?? 0,
      resolvedIssueCount: connection.resolvedIssueCount ?? 0,
      unacknowledgedAlerts: unacknowledged.length,
      lastError: connection.lastError,
    };
  },
});

export const listIssues = query({
  args: { includeResolved: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const issues = await ctx.db.query("workbookIssues").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    return issues
      .filter((issue) => args.includeResolved || issue.status !== "resolved")
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
      .slice(0, 500);
  },
});

export const listAlerts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    return await ctx.db
      .query("workbookAlerts")
      .withIndex("by_owner_created", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(Math.max(1, Math.min(args.limit ?? 20, 50)));
  },
});

export const acknowledgeAlerts = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const alerts = await ctx.db.query("workbookAlerts").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    const now = Date.now();
    let count = 0;
    for (const alert of alerts) {
      if (alert.acknowledgedAt) continue;
      await ctx.db.patch(alert._id, { acknowledgedAt: now });
      count += 1;
    }
    return { acknowledged: count };
  },
});

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const connection = await ctx.db.query("workbookConnections").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).unique();
    if (!connection) return { removed: false };
    const [issues, alerts] = await Promise.all([
      ctx.db.query("workbookIssues").withIndex("by_connection", (q) => q.eq("connectionId", connection._id)).collect(),
      ctx.db.query("workbookAlerts").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect(),
    ]);
    for (const issue of issues) await ctx.db.delete(issue._id);
    for (const alert of alerts) await ctx.db.delete(alert._id);
    await ctx.db.delete(connection._id);
    return { removed: true };
  },
});

export const upsertConnection = internalMutation({
  args: {
    ownerId: v.id("users"),
    driveId: v.string(),
    itemId: v.string(),
    fileName: v.string(),
    webUrl: v.optional(v.string()),
    eTag: v.optional(v.string()),
    lastModifiedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("workbookConnections").withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId)).unique();
    const now = Date.now();
    const fields = {
      driveId: args.driveId,
      itemId: args.itemId,
      fileName: args.fileName,
      webUrl: args.webUrl,
      eTag: undefined,
      lastModifiedAt: args.lastModifiedAt,
      status: "connected" as const,
      lastCheckedAt: undefined,
      nextCheckAt: now,
      lastChangedAt: undefined,
      totalSeats: undefined,
      occupiedSeats: undefined,
      issueCount: undefined,
      newIssueCount: undefined,
      resolvedIssueCount: undefined,
      lastError: undefined,
      updatedAt: now,
    };
    if (existing) {
      const [issues, alerts] = await Promise.all([
        ctx.db.query("workbookIssues").withIndex("by_connection", (q) => q.eq("connectionId", existing._id)).collect(),
        ctx.db.query("workbookAlerts").withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId)).collect(),
      ]);
      for (const issue of issues) await ctx.db.delete(issue._id);
      for (const alert of alerts) await ctx.db.delete(alert._id);
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("workbookConnections", {
      ownerId: args.ownerId,
      connectedAt: now,
      ...fields,
    });
  },
});

export const connectionForOwner = internalQuery({
  args: { ownerId: v.id("users") },
  handler: async (ctx, args) => await ctx.db.query("workbookConnections").withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId)).unique(),
});

export const monitoredOwnerIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const connections = await ctx.db.query("workbookConnections").collect();
    return connections.map((connection) => connection.ownerId);
  },
});

export const markSyncing = internalMutation({
  args: { ownerId: v.id("users") },
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("workbookConnections").withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId)).unique();
    if (connection) await ctx.db.patch(connection._id, { status: "syncing", lastError: undefined, updatedAt: Date.now() });
  },
});

export const markUnchanged = internalMutation({
  args: {
    ownerId: v.id("users"),
    eTag: v.optional(v.string()),
    lastModifiedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("workbookConnections").withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId)).unique();
    if (!connection) return;
    const now = Date.now();
    await ctx.db.patch(connection._id, {
      status: "connected",
      eTag: args.eTag ?? connection.eTag,
      lastModifiedAt: args.lastModifiedAt ?? connection.lastModifiedAt,
      lastCheckedAt: now,
      nextCheckAt: now + 5 * 60 * 1000,
      lastError: undefined,
      updatedAt: now,
    });
  },
});

export const markError = internalMutation({
  args: { ownerId: v.id("users"), message: v.string() },
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("workbookConnections").withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId)).unique();
    if (!connection) return;
    const now = Date.now();
    const shouldAlert = connection.status !== "error" || connection.lastError !== args.message;
    await ctx.db.patch(connection._id, {
      status: "error",
      lastCheckedAt: now,
      nextCheckAt: now + 5 * 60 * 1000,
      lastError: args.message,
      updatedAt: now,
    });
    if (shouldAlert) {
      await ctx.db.insert("workbookAlerts", {
        ownerId: args.ownerId,
        connectionId: connection._id,
        kind: "sync_error",
        message: `Live workbook check failed: ${args.message}`,
        issueCount: 0,
        createdAt: now,
      });
    }
  },
});

export const storeSnapshot = internalMutation({
  args: {
    ownerId: v.id("users"),
    rows: v.array(allocationRow),
    issues: v.array(workbookIssue),
    summary: v.object({
      totalSeats: v.number(),
      occupiedSeats: v.number(),
      vacantSeats: v.number(),
      issueCount: v.number(),
    }),
    fileName: v.string(),
    webUrl: v.optional(v.string()),
    eTag: v.optional(v.string()),
    lastModifiedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.rows.length > 2000) throw new Error("Live workbook monitoring supports at most 2,000 allocation rows.");
    const connection = await ctx.db.query("workbookConnections").withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId)).unique();
    if (!connection) throw new Error("No live workbook is connected.");
    const now = Date.now();
    const baseline = connection.totalSeats === undefined;
    const existingIssues = await ctx.db.query("workbookIssues").withIndex("by_connection", (q) => q.eq("connectionId", connection._id)).collect();
    const previousActiveKeys = existingIssues.filter((issue) => issue.status !== "resolved").map((issue) => issue.issueKey);
    const currentKeys = args.issues.map((issue) => issue.key);
    const delta = diffWorkbookIssueKeys(previousActiveKeys, currentKeys);
    const existingByKey = new Map(existingIssues.map((issue) => [issue.issueKey, issue]));

    for (const issue of args.issues) {
      const existing = existingByKey.get(issue.key);
      const status = baseline || delta.ongoingKeys.includes(issue.key) ? "ongoing" as const : "new" as const;
      const fields = {
        type: issue.type,
        severity: issue.severity,
        delegate: issue.delegate,
        location: issue.location,
        action: issue.action,
        status,
        lastSeenAt: now,
        resolvedAt: undefined,
      };
      if (existing) await ctx.db.patch(existing._id, fields);
      else await ctx.db.insert("workbookIssues", {
        ownerId: args.ownerId,
        connectionId: connection._id,
        issueKey: issue.key,
        firstSeenAt: now,
        ...fields,
      });
    }
    for (const issue of existingIssues) {
      if (issue.status !== "resolved" && delta.resolvedKeys.includes(issue.issueKey)) {
        await ctx.db.patch(issue._id, { status: "resolved", resolvedAt: now });
      }
    }

    const existingRows = await ctx.db.query("allocationRows").withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId)).collect();
    for (const row of existingRows) await ctx.db.delete(row._id);
    for (const row of args.rows) {
      await ctx.db.insert("allocationRows", {
        ...row,
        ownerId: args.ownerId,
        importFile: `Live: ${args.fileName}`,
        updatedAt: now,
      });
    }

    const newIssueCount = baseline ? 0 : delta.newKeys.length;
    const resolvedIssueCount = baseline ? 0 : delta.resolvedKeys.length;
    await ctx.db.patch(connection._id, {
      status: "connected",
      fileName: args.fileName,
      webUrl: args.webUrl ?? connection.webUrl,
      eTag: args.eTag,
      lastModifiedAt: args.lastModifiedAt,
      lastCheckedAt: now,
      nextCheckAt: now + 5 * 60 * 1000,
      lastChangedAt: now,
      totalSeats: args.summary.totalSeats,
      occupiedSeats: args.summary.occupiedSeats,
      issueCount: args.summary.issueCount,
      newIssueCount,
      resolvedIssueCount,
      lastError: undefined,
      updatedAt: now,
    });
    await ctx.db.insert("imports", {
      ownerId: args.ownerId,
      kind: "allocations",
      fileName: `Live: ${args.fileName}`,
      rowCount: args.rows.length,
      issueCount: args.summary.issueCount,
      summary: `${args.rows.length} live allocation seats analyzed; ${args.summary.issueCount} issues need review.`,
      importedAt: now,
    });
    if (newIssueCount > 0) {
      await ctx.db.insert("workbookAlerts", {
        ownerId: args.ownerId,
        connectionId: connection._id,
        kind: "new_issues",
        message: `${newIssueCount} new workbook issue${newIssueCount === 1 ? "" : "s"} detected in ${args.fileName}.`,
        issueCount: newIssueCount,
        createdAt: now,
      });
    }
    if (resolvedIssueCount > 0) {
      await ctx.db.insert("workbookAlerts", {
        ownerId: args.ownerId,
        connectionId: connection._id,
        kind: "resolved_issues",
        message: `${resolvedIssueCount} workbook issue${resolvedIssueCount === 1 ? "" : "s"} resolved in ${args.fileName}.`,
        issueCount: resolvedIssueCount,
        createdAt: now,
      });
    }
    return {
      baseline,
      rowCount: args.rows.length,
      issueCount: args.summary.issueCount,
      newIssueCount,
      resolvedIssueCount,
    };
  },
});
