export type WorkspaceStatus = { initialized: boolean } | undefined;
export type WorkspaceGateState = {
  mode: "checking" | "preparing" | "error" | "ready";
  title: string;
  detail: string;
};

export function workspaceGateState(status: WorkspaceStatus, error: string | null): WorkspaceGateState {
  if (status?.initialized) return { mode: "ready", title: "Workspace ready", detail: "" };
  if (error) return { mode: "error", title: "Workspace setup paused", detail: error };
  if (status === undefined) {
    return {
      mode: "checking",
      title: "Restoring your workspace",
      detail: "Checking your secure session and workspace data.",
    };
  }
  return {
    mode: "preparing",
    title: "Preparing Oakridge Operations",
    detail: "Creating the initial contacts and safe routing defaults.",
  };
}
