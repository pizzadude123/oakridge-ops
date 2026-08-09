import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

type AuthCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

export async function requireUserId(ctx: AuthCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Sign in to use this private workspace.");
  return userId;
}
