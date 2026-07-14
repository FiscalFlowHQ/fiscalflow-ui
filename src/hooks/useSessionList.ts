import { useCallback, useEffect, useRef, useState } from "react";
import { createSession as apiCreateSession, getSessionState, getSessionStatus } from "../api/fiscalflow";
import type { RunStatus } from "../types/api";
import type { LocalSession } from "../types/session";
import {
  createLocalSession,
  loadSessions,
  patchSession,
  removeSession,
  touchOpened,
  upsertSession,
} from "../stores/sessionStore";

const STATUS_CONCURRENCY = 10;

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function refreshSessionMeta(session: LocalSession): Promise<{
  lastRunStatus: RunStatus | null;
  paused: boolean;
} | null> {
  try {
    const status = await getSessionStatus(session.threadId);
    const lastRunStatus = (status.run_status as RunStatus | null) ?? null;
    const terminal =
      lastRunStatus === "completed" ||
      lastRunStatus === "failed" ||
      lastRunStatus === "cancelled";

    let paused = false;
    if (!terminal) {
      try {
        const state = await getSessionState(session.threadId);
        paused = state.interrupt != null;
      } catch {
        paused = Boolean(session.paused);
      }
    }
    return { lastRunStatus, paused };
  } catch {
    return null;
  }
}

export type UseSessionListResult = {
  sessions: LocalSession[];
  creating: boolean;
  refreshing: boolean;
  createError: string | null;
  /** Create via `POST /sessions`, persist, return the new thread id. */
  createNewSession: () => Promise<string | null>;
  /** Update `lastOpenedAt` and return the thread id (caller navigates). */
  openSession: (threadId: string) => void;
  deleteSession: (threadId: string) => void;
  refreshStatuses: () => Promise<void>;
  /** Patch helpers for later tasks (databook, run status). */
  updateSession: (
    threadId: string,
    patch: Partial<Pick<LocalSession, "title" | "documentRef" | "lastRunStatus" | "paused">>
  ) => void;
};

export function useSessionList(): UseSessionListResult {
  const [sessions, setSessions] = useState<LocalSession[]>(() => loadSessions());
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const refreshGen = useRef(0);

  const refreshStatuses = useCallback(async () => {
    const gen = ++refreshGen.current;
    const current = loadSessions();
    if (current.length === 0) {
      setSessions([]);
      return;
    }
    setRefreshing(true);
    try {
      await mapPool(current, STATUS_CONCURRENCY, async (session) => {
        const meta = await refreshSessionMeta(session);
        if (!meta || gen !== refreshGen.current) return;
        patchSession(session.threadId, {
          lastRunStatus: meta.lastRunStatus,
          paused: meta.paused,
        });
      });
      if (gen === refreshGen.current) {
        setSessions(loadSessions());
      }
    } finally {
      if (gen === refreshGen.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setSessions(loadSessions());
    void refreshStatuses();
  }, [refreshStatuses]);

  const createNewSession = useCallback(async (): Promise<string | null> => {
    setCreating(true);
    setCreateError(null);
    try {
      const { thread_id } = await apiCreateSession();
      const local = createLocalSession(thread_id);
      setSessions(upsertSession(local));
      return thread_id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create session";
      setCreateError(message);
      return null;
    } finally {
      setCreating(false);
    }
  }, []);

  const openSession = useCallback((threadId: string) => {
    setSessions(touchOpened(threadId));
  }, []);

  const deleteSession = useCallback((threadId: string) => {
    setSessions(removeSession(threadId));
  }, []);

  const updateSession = useCallback(
    (
      threadId: string,
      patch: Partial<Pick<LocalSession, "title" | "documentRef" | "lastRunStatus" | "paused">>
    ) => {
      setSessions(patchSession(threadId, patch));
    },
    []
  );

  return {
    sessions,
    creating,
    refreshing,
    createError,
    createNewSession,
    openSession,
    deleteSession,
    refreshStatuses,
    updateSession,
  };
}
