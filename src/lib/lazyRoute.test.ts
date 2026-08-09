import { describe, expect, it, vi } from "vitest";
import { hasLazyRouteRecovery, importLazyRoute, isLazyRouteFailure } from "./lazyRoute";
import { workspaceGateState } from "../domain/workspaceGate";

describe("lazy route recovery", () => {
  it("reloads once after a stale deployment chunk fails", async () => {
    const store = new Map<string, string>();
    const reload = vi.fn();
    const error = new TypeError("Failed to fetch dynamically imported module: /assets/EmailPage-old.js");
    await expect(importLazyRoute("email", async () => { throw error; }, {
      get: (key) => store.get(key) ?? null,
      set: (key, value) => store.set(key, value),
      remove: (key) => store.delete(key),
      reload,
    })).rejects.toBe(error);
    expect(reload).toHaveBeenCalledOnce();
    expect(hasLazyRouteRecovery("email", {
      get: (key) => store.get(key) ?? null,
      set: (key, value) => store.set(key, value),
      remove: (key) => store.delete(key),
      reload,
    })).toBe(true);

    await expect(importLazyRoute("email", async () => { throw error; }, {
      get: (key) => store.get(key) ?? null,
      set: (key, value) => store.set(key, value),
      remove: (key) => store.delete(key),
      reload,
    })).rejects.toBe(error);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("clears recovery state after a route loads and ignores ordinary render errors", async () => {
    const store = new Map<string, string>([["oakridge-route-recovery:email", "1"]]);
    const module = { default: () => null };
    await expect(importLazyRoute("email", async () => module, {
      get: (key) => store.get(key) ?? null,
      set: (key, value) => store.set(key, value),
      remove: (key) => store.delete(key),
      reload: vi.fn(),
    })).resolves.toBe(module);
    expect(store.size).toBe(0);
    expect(isLazyRouteFailure(new Error("Component exploded"))).toBe(false);
  });
});

describe("workspace boot state", () => {
  it("distinguishes connection checks, setup, and setup errors", () => {
    expect(workspaceGateState(undefined, null)).toEqual({ title: "Restoring your workspace", detail: "Checking your secure session and workspace data.", mode: "checking" });
    expect(workspaceGateState({ initialized: false }, null).mode).toBe("preparing");
    expect(workspaceGateState({ initialized: false }, "Network unavailable")).toEqual({ title: "Workspace setup paused", detail: "Network unavailable", mode: "error" });
    expect(workspaceGateState({ initialized: true }, null).mode).toBe("ready");
  });
});
