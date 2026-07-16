import type { RunStatus } from "../types/api";

export type RunStatusBadgeKey =
  | "draft"
  | "running"
  | "awaiting_review"
  | "complete"
  | "failed"
  | "cancelled";

export type RunStatusBadge = {
  key: RunStatusBadgeKey;
  label: string;
};

const RUNNING: ReadonlySet<string> = new Set([
  "ingesting",
  "planning",
  "awaiting_approval",
  "generating",
  "reviewing",
  "assembling",
]);

/**
 * Map backend `run_status` + pause detection to a Home/session chip.
 * Pause is **not** a `run_status` — it comes from `state.interrupt != null`.
 */
export function runStatusBadge(opts: {
  lastRunStatus?: RunStatus | string | null;
  paused?: boolean;
}): RunStatusBadge {
  const status = opts.lastRunStatus ?? null;

  if (opts.paused) {
    return { key: "awaiting_review", label: "Awaiting review" };
  }
  if (status === "completed") {
    return { key: "complete", label: "Complete" };
  }
  if (status === "failed") {
    return { key: "failed", label: "Failed" };
  }
  if (status === "cancelled") {
    return { key: "cancelled", label: "Cancelled" };
  }
  if (status && RUNNING.has(status)) {
    return { key: "running", label: "Running" };
  }
  return { key: "draft", label: "Draft" };
}
