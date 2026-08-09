import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ getAuthUserId: vi.fn() }));
vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: authMocks.getAuthUserId }));

import { requireAdministratorAction } from "./requireUser";

describe("administrator action authorization", () => {
  const runQuery = vi.fn();
  const ctx = { runQuery } as never;

  beforeEach(() => {
    authMocks.getAuthUserId.mockReset();
    runQuery.mockReset();
  });

  it("rejects unauthenticated callers before a role lookup", async () => {
    authMocks.getAuthUserId.mockResolvedValue(null);
    await expect(requireAdministratorAction(ctx, "Sign in first.")).rejects.toThrow("Sign in first.");
    expect(runQuery).not.toHaveBeenCalled();
  });

  it("rejects experience publishers from operational actions", async () => {
    authMocks.getAuthUserId.mockResolvedValue("user-publisher");
    runQuery.mockResolvedValue("experience_publisher");
    await expect(requireAdministratorAction(ctx, "Sign in first.")).rejects.toThrow("Administrator access is required");
  });

  it("returns the administrator id for operational actions", async () => {
    authMocks.getAuthUserId.mockResolvedValue("user-admin");
    runQuery.mockResolvedValue("administrator");
    await expect(requireAdministratorAction(ctx, "Sign in first.")).resolves.toBe("user-admin");
  });
});
