import type { RunStatus } from "./api";

/** Locally persisted FDD run metadata (`localStorage` key `fiscalflow.sessions.v1`). */
export type LocalSession = {
  threadId: string;
  title: string;
  createdAt: string;
  lastOpenedAt: string;
  documentRef?: string;
  /** Last known `GET /sessions/{id}/status` → `run_status`. */
  lastRunStatus?: RunStatus | null;
  /** True when `GET /sessions/{id}/state` → `interrupt != null`. */
  paused?: boolean;
};

export const SESSIONS_STORAGE_KEY = "fiscalflow.sessions.v1";
