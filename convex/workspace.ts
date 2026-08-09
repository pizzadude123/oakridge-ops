import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/requireUser";

const INITIAL_CONTACTS = [
  {
    fullName: "Naga Pranay Immadi",
    email: "nagapranayimmadi@gmail.com",
    school: "Oakridge International School",
    department: "Policy",
    paymentStatus: "reported_paid" as const,
    replyStatus: "not_contacted" as const,
    tags: ["test", "policy"],
    preference1: "UNSC",
    preference2: "DISEC",
    preference3: "UNHRC",
    assignedCommittee: "UNSC",
    assignedAllocation: "United States of America",
    source: "Test contact",
  },
  {
    fullName: "Oakridge Test Contact",
    email: "cattartzz@gmail.com",
    school: "Oakridge International School",
    department: "Finance",
    paymentStatus: "unpaid" as const,
    replyStatus: "awaiting_reply" as const,
    tags: ["test", "finance"],
    preference1: "DISEC",
    preference2: "OIC",
    preference3: "UN Women",
    source: "Test contact",
  },
];

const INITIAL_RULES = [
  {
    name: "Allocation and committee questions",
    department: "Policy",
    keywords: ["allocation", "allocations", "committee", "preference"],
    recipients: ["nagapranayimmadi@gmail.com"],
    enabled: true,
    priority: 20,
  },
  {
    name: "Payment and receipt questions",
    department: "Finance",
    keywords: ["payment", "paid", "receipt", "refund"],
    recipients: ["cattartzz@gmail.com"],
    enabled: true,
    priority: 10,
  },
];

export const status = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    return { initialized: settings !== null, settings };
  },
});

export const bootstrap = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const existingSettings = await ctx.db
      .query("settings")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    if (existingSettings) return { created: false };

    const now = Date.now();
    for (const contact of INITIAL_CONTACTS) {
      await ctx.db.insert("contacts", { ...contact, ownerId, updatedAt: now });
    }
    for (const rule of INITIAL_RULES) {
      await ctx.db.insert("routingRules", { ...rule, ownerId, updatedAt: now });
    }
    await ctx.db.insert("settings", {
      ownerId,
      gmailSender: "cattartzz@gmail.com",
      workspaceName: "Oakridge MUN Operations",
      initializedAt: now,
    });
    return { created: true };
  },
});
