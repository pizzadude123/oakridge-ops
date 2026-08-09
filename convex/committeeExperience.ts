import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { canManageExperienceRecord, nextCrisisUpdateNumber } from "./lib/experienceAccess";
import { requireAuthenticatedStaff } from "./lib/requireUser";

const committee = v.union(v.literal("disec"), v.literal("armageddon"));
const channel = v.union(v.literal("jcc"), v.literal("armageddon"));
const severity = v.union(v.literal("advisory"), v.literal("breaking"), v.literal("critical"));
const transmission = v.union(v.literal("intelligence"), v.literal("directive"), v.literal("broadcast"));

function requiredText(label: string, value: string, maximum: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return cleaned;
}

function optionalText(label: string, value: string, maximum: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return cleaned;
}

function validYouTubeUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "").toLocaleLowerCase();
    return host === "youtu.be" || host === "youtube.com" || host === "m.youtube.com";
  } catch {
    return false;
  }
}

export const publicCommitteeMedia = query({
  args: { committee },
  handler: async (ctx, args) => {
    const media = await ctx.db
      .query("committeeMedia")
      .withIndex("by_committee", (q) => q.eq("committee", args.committee))
      .unique();
    if (!media?.published) return null;
    return {
      committee: media.committee,
      title: media.title,
      speaker: media.speaker,
      description: media.description,
      videoUrl: media.videoUrl,
      updatedAt: media.updatedAt,
    };
  },
});

export const publicCrisisUpdates = query({
  args: { channel },
  handler: async (ctx, args) => {
    const updates = await ctx.db
      .query("crisisUpdates")
      .withIndex("by_channel_published", (q) => q.eq("channel", args.channel).eq("isPublished", true))
      .order("desc")
      .take(50);
    return updates.map((update) => ({
      _id: update._id,
      channel: update.channel,
      updateNumber: update.updateNumber,
      headline: update.headline,
      briefing: update.briefing,
      severity: update.severity,
      transmission: update.transmission,
      sourceLabel: update.sourceLabel,
      affectedPortfolios: update.affectedPortfolios,
      publishedAt: update.publishedAt,
    }));
  },
});

export const adminExperience = query({
  args: {},
  handler: async (ctx) => {
    const staff = await requireAuthenticatedStaff(ctx);
    const media = await ctx.db.query("committeeMedia").collect();
    const updates = staff.role === "administrator"
      ? await ctx.db.query("crisisUpdates").order("desc").collect()
      : await ctx.db.query("crisisUpdates").withIndex("by_owner", (q) => q.eq("ownerId", staff.userId)).order("desc").collect();
    return { media, updates };
  },
});

export const saveCommitteeMedia = mutation({
  args: {
    committee,
    title: v.string(),
    speaker: v.string(),
    description: v.string(),
    videoUrl: v.string(),
    published: v.boolean(),
  },
  handler: async (ctx, args) => {
    const staff = await requireAuthenticatedStaff(ctx);
    const title = requiredText("Video title", args.title, 100);
    const speaker = requiredText("Speaker", args.speaker, 100);
    const description = optionalText("Description", args.description, 400);
    const videoUrl = args.videoUrl.trim();
    if (args.published && !validYouTubeUrl(videoUrl)) throw new Error("Use a valid YouTube URL before publishing.");
    if (videoUrl && !validYouTubeUrl(videoUrl)) throw new Error("Chair explainers currently support YouTube URLs only.");
    const existing = await ctx.db
      .query("committeeMedia")
      .withIndex("by_committee", (q) => q.eq("committee", args.committee))
      .unique();
    const fields = { title, speaker, description, videoUrl, published: args.published, ownerId: staff.userId, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return { mediaId: existing._id };
    }
    const mediaId = await ctx.db.insert("committeeMedia", { ...fields, committee: args.committee });
    return { mediaId };
  },
});

export const saveCrisisUpdate = mutation({
  args: {
    updateId: v.optional(v.id("crisisUpdates")),
    channel,
    headline: v.string(),
    briefing: v.string(),
    severity,
    transmission,
    sourceLabel: v.string(),
    affectedPortfolios: v.array(v.string()),
    isPublished: v.boolean(),
  },
  handler: async (ctx, args) => {
    const staff = await requireAuthenticatedStaff(ctx);
    const headline = requiredText("Headline", args.headline, 140);
    const briefing = requiredText("Briefing", args.briefing, 2400);
    const sourceLabel = requiredText("Source label", args.sourceLabel, 80);
    const affectedPortfolios = [...new Set(args.affectedPortfolios.map((item) => optionalText("Portfolio", item, 60)).filter(Boolean))];
    if (affectedPortfolios.length > 12) throw new Error("Add at most 12 affected portfolios.");
    const now = Date.now();

    if (args.updateId) {
      const existing = await ctx.db.get(args.updateId);
      if (!existing || !canManageExperienceRecord(staff.role, staff.userId, existing.ownerId)) throw new Error("Crisis update not found.");
      let updateNumber = existing.updateNumber;
      if (existing.channel !== args.channel) {
        const targetUpdates = await ctx.db
          .query("crisisUpdates")
          .withIndex("by_channel_published", (q) => q.eq("channel", args.channel))
          .collect();
        updateNumber = nextCrisisUpdateNumber(targetUpdates);
      }
      await ctx.db.patch(existing._id, {
        channel: args.channel,
        updateNumber,
        headline,
        briefing,
        severity: args.severity,
        transmission: args.transmission,
        sourceLabel,
        affectedPortfolios,
        isPublished: args.isPublished,
        publishedAt: args.isPublished ? existing.publishedAt ?? now : undefined,
        updatedAt: now,
      });
      return { updateId: existing._id, updateNumber };
    }

    const existingUpdates = await ctx.db
      .query("crisisUpdates")
      .withIndex("by_channel_published", (q) => q.eq("channel", args.channel))
      .collect();
    const updateNumber = nextCrisisUpdateNumber(existingUpdates);
    const updateId = await ctx.db.insert("crisisUpdates", {
      ownerId: staff.userId,
      channel: args.channel,
      updateNumber,
      headline,
      briefing,
      severity: args.severity,
      transmission: args.transmission,
      sourceLabel,
      affectedPortfolios,
      isPublished: args.isPublished,
      publishedAt: args.isPublished ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });
    return { updateId, updateNumber };
  },
});

export const setCrisisPublished = mutation({
  args: { updateId: v.id("crisisUpdates"), isPublished: v.boolean() },
  handler: async (ctx, args) => {
    const staff = await requireAuthenticatedStaff(ctx);
    const update = await ctx.db.get(args.updateId);
    if (!update || !canManageExperienceRecord(staff.role, staff.userId, update.ownerId)) throw new Error("Crisis update not found.");
    await ctx.db.patch(update._id, {
      isPublished: args.isPublished,
      publishedAt: args.isPublished ? update.publishedAt ?? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    return { isPublished: args.isPublished };
  },
});

export const deleteCrisisUpdate = mutation({
  args: { updateId: v.id("crisisUpdates") },
  handler: async (ctx, args) => {
    const staff = await requireAuthenticatedStaff(ctx);
    const update = await ctx.db.get(args.updateId);
    if (!update || !canManageExperienceRecord(staff.role, staff.userId, update.ownerId)) throw new Error("Crisis update not found.");
    await ctx.db.delete(update._id);
    return { deleted: true };
  },
});
