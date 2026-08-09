import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { internal } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { staffRoleForEmail } from "./access";

type AuthCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

export async function requireAuthenticatedStaff(ctx: AuthCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Sign in to use this private workspace.");
  const user = await ctx.db.get(userId);
  const role = staffRoleForEmail(user?.email);
  if (!role) throw new Error("This Oakridge account is not authorized.");
  return { userId, role };
}

export async function requireUserId(ctx: AuthCtx) {
  const staff = await requireAuthenticatedStaff(ctx);
  if (staff.role !== "administrator") throw new Error("Administrator access is required for operations data.");
  return staff.userId;
}

export async function requireExperiencePublisherId(ctx: AuthCtx) {
  const staff = await requireAuthenticatedStaff(ctx);
  return staff.userId;
}

export async function requireAdministratorAction(ctx: GenericActionCtx<DataModel>, signInMessage: string) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error(signInMessage);
  const role = await ctx.runQuery(internal.access.roleForUser, { userId });
  if (role !== "administrator") throw new Error("Administrator access is required for operations data.");
  return userId;
}
