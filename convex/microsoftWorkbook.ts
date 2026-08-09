"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import * as XLSX from "xlsx";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { buildWorkbookSnapshot, encodeGraphShareUrl } from "./lib/workbookMonitor";
import { decryptGraphSecret, encryptGraphSecret } from "./lib/graphCrypto";
import { ProviderTokenError, shouldRequireReauthorization } from "./lib/mailDelivery";
import { extractAllocationRows } from "../src/domain/operations";

const GRAPH_SCOPES = "openid profile offline_access User.Read Mail.Read Mail.Send Files.Read";
const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024;

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function tenantAuthority() {
  return process.env.MICROSOFT_TENANT_ID || "common";
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Live workbook synchronization failed.")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 400);
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

type DriveItem = {
  id?: string;
  name?: string;
  webUrl?: string;
  eTag?: string;
  lastModifiedDateTime?: string;
  size?: number;
  file?: { mimeType?: string };
  parentReference?: { driveId?: string };
  error?: { message?: string };
};

async function accessTokenForOwner(ctx: ActionCtx, ownerId: Id<"users">) {
  const connection = await ctx.runQuery(internal.graphData.connectionForSync, { ownerId });
  if (!connection?.encryptedRefreshToken || !connection.refreshTokenIv || connection.status !== "connected") {
    throw new Error("Connect the Microsoft account before linking a live workbook.");
  }
  const refreshToken = await decryptGraphSecret(connection.encryptedRefreshToken, connection.refreshTokenIv);
  const response = await fetch(`https://login.microsoftonline.com/${tenantAuthority()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredEnv("MICROSOFT_CLIENT_ID"),
      client_secret: requiredEnv("MICROSOFT_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      redirect_uri: requiredEnv("MICROSOFT_GRAPH_REDIRECT_URI"),
      scope: GRAPH_SCOPES,
    }),
  });
  const body = await response.json() as TokenResponse;
  if (!response.ok || !body.access_token) {
    const message = `Microsoft authorization failed (${response.status}): ${body.error_description || body.error || "token unavailable"}`;
    const error = new ProviderTokenError(response.status, body.error, message);
    if (shouldRequireReauthorization(error.status, error.providerError)) {
      await ctx.runMutation(internal.graphData.markReauthorizationRequired, { ownerId, message });
    }
    throw error;
  }
  if (body.refresh_token) {
    const rotated = await encryptGraphSecret(body.refresh_token);
    await ctx.runMutation(internal.graphData.rotateRefreshToken, {
      ownerId,
      encryptedRefreshToken: rotated.ciphertext,
      refreshTokenIv: rotated.iv,
    });
  }
  return body.access_token;
}

async function graphDriveItem(accessToken: string, endpoint: URL) {
  const response = await fetch(endpoint, {
    headers: {
      Authorization: "Bearer".concat(" ", accessToken),
      Prefer: "redeemSharingLinkIfNecessary",
    },
  });
  const body = await response.json() as DriveItem;
  if (!response.ok) throw new Error(`Microsoft workbook request failed (${response.status}): ${body.error?.message || "request rejected"}`);
  return body;
}

function assertExcelFile(item: DriveItem) {
  if (!item.id || !item.name || !item.parentReference?.driveId) {
    throw new Error("Microsoft did not return a usable workbook item.");
  }
  if (!/\.(xlsx|xlsm|xlsb|xls)$/i.test(item.name)) {
    throw new Error("The shared link must point directly to an Excel workbook.");
  }
  if ((item.size ?? 0) > MAX_WORKBOOK_BYTES) {
    throw new Error("The live workbook exceeds the 25 MB monitoring limit.");
  }
}

export const connectWorkbook = action({
  args: { shareUrl: v.string() },
  handler: async (ctx, args): Promise<{ fileName: string }> => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Sign in before connecting a live workbook.");
    if (args.shareUrl.length > 2048) throw new Error("The workbook share link is too long.");
    const accessToken = await accessTokenForOwner(ctx, ownerId);
    const endpoint = new URL(`https://graph.microsoft.com/v1.0/shares/${encodeGraphShareUrl(args.shareUrl)}/driveItem`);
    endpoint.searchParams.set("$select", "id,name,webUrl,eTag,lastModifiedDateTime,size,file,parentReference");
    const item = await graphDriveItem(accessToken, endpoint);
    assertExcelFile(item);
    await ctx.runMutation(internal.workbookData.upsertConnection, {
      ownerId,
      driveId: item.parentReference!.driveId!,
      itemId: item.id!,
      fileName: item.name!,
      webUrl: item.webUrl,
      eTag: item.eTag,
      lastModifiedAt: item.lastModifiedDateTime,
    });
    await ctx.scheduler.runAfter(0, internal.microsoftWorkbook.syncWorkbook, { ownerId, force: false });
    return { fileName: item.name! };
  },
});

export const syncNow = action({
  args: {},
  handler: async (ctx): Promise<{ changed: boolean; rowCount?: number; issueCount?: number; newIssueCount?: number; resolvedIssueCount?: number }> => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Sign in before checking the live workbook.");
    return await ctx.runAction(internal.microsoftWorkbook.syncWorkbook, { ownerId, force: false });
  },
});

export const syncWorkbook = internalAction({
  args: { ownerId: v.id("users"), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ changed: boolean; rowCount?: number; issueCount?: number; newIssueCount?: number; resolvedIssueCount?: number }> => {
    await ctx.runMutation(internal.workbookData.markSyncing, { ownerId: args.ownerId });
    try {
      const connection = await ctx.runQuery(internal.workbookData.connectionForOwner, { ownerId: args.ownerId });
      if (!connection) throw new Error("No live workbook is connected.");
      const accessToken = await accessTokenForOwner(ctx, args.ownerId);
      const metadataUrl = new URL(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(connection.driveId)}/items/${encodeURIComponent(connection.itemId)}`);
      metadataUrl.searchParams.set("$select", "id,name,webUrl,eTag,lastModifiedDateTime,size,file,parentReference");
      const item = await graphDriveItem(accessToken, metadataUrl);
      assertExcelFile(item);
      if (!args.force && connection.eTag && item.eTag === connection.eTag) {
        await ctx.runMutation(internal.workbookData.markUnchanged, {
          ownerId: args.ownerId,
          eTag: item.eTag,
          lastModifiedAt: item.lastModifiedDateTime,
        });
        return { changed: false };
      }

      const contentUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(connection.driveId)}/items/${encodeURIComponent(connection.itemId)}/content`;
      const response = await fetch(contentUrl, { headers: { Authorization: "Bearer".concat(" ", accessToken) } });
      if (!response.ok) throw new Error(`Microsoft workbook download failed (${response.status}).`);
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > MAX_WORKBOOK_BYTES) throw new Error("The live workbook exceeds the 25 MB monitoring limit.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_WORKBOOK_BYTES) throw new Error("The live workbook exceeds the 25 MB monitoring limit.");
      const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
      const rows = workbook.SheetNames.flatMap((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return [];
        const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
        return extractAllocationRows(sheetName, sheetRows);
      });
      if (!rows.length) throw new Error("No allocation tables were found in the connected workbook.");
      const snapshot = buildWorkbookSnapshot(rows);
      const result = await ctx.runMutation(internal.workbookData.storeSnapshot, {
        ownerId: args.ownerId,
        rows,
        issues: snapshot.issues,
        summary: snapshot.summary,
        fileName: item.name!,
        webUrl: item.webUrl,
        eTag: item.eTag,
        lastModifiedAt: item.lastModifiedDateTime,
      });
      return { changed: true, ...result };
    } catch (error) {
      const message = safeError(error);
      await ctx.runMutation(internal.workbookData.markError, { ownerId: args.ownerId, message });
      throw new Error(message, { cause: error });
    }
  },
});

export const syncAllWorkbooks = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scheduled: number }> => {
    const ownerIds = await ctx.runQuery(internal.workbookData.monitoredOwnerIds, {});
    for (const [index, ownerId] of ownerIds.entries()) {
      await ctx.scheduler.runAfter(index * 750, internal.microsoftWorkbook.syncWorkbook, { ownerId, force: false });
    }
    return { scheduled: ownerIds.length };
  },
});
