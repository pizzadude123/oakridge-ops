import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import { staffRoleForEmail } from "./lib/access";

export const roleForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return staffRoleForEmail(user?.email);
  },
});

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    const role = staffRoleForEmail(user?.email);
    return role ? { role, email: user?.email ?? "" } : null;
  },
});