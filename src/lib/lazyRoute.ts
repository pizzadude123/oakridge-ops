const RECOVERY_PREFIX = "oakridge-route-recovery:";

export type LazyRouteRuntime = {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
  reload: () => void;
};

function browserRuntime(): LazyRouteRuntime {
  return {
    get: (key) => window.sessionStorage.getItem(key),
    set: (key, value) => window.sessionStorage.setItem(key, value),
    remove: (key) => window.sessionStorage.removeItem(key),
    reload: () => window.location.reload(),
  };
}

export function isLazyRouteFailure(error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /ChunkLoadError|Loading chunk .* failed|dynamically imported module|module script|JavaScript-or-Wasm module/i.test(message);
}

export function hasLazyRouteRecovery(routeKey: string, runtime: LazyRouteRuntime = browserRuntime()) {
  return runtime.get(`${RECOVERY_PREFIX}${routeKey}`) === "1";
}

export async function importLazyRoute<T>(
  routeKey: string,
  importer: () => Promise<T>,
  runtime: LazyRouteRuntime = browserRuntime(),
) {
  const recoveryKey = `${RECOVERY_PREFIX}${routeKey}`;
  try {
    const module = await importer();
    runtime.remove(recoveryKey);
    return module;
  } catch (error) {
    if (isLazyRouteFailure(error) && runtime.get(recoveryKey) !== "1") {
      runtime.set(recoveryKey, "1");
      runtime.reload();
    }
    throw error;
  }
}

export function clearLazyRouteRecovery(routeKey: string) {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(`${RECOVERY_PREFIX}${routeKey}`);
}
