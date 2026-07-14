import { useCallback, useRef, useState } from "react";
import { getSessionState, getSessionStatus } from "../api/fiscalflow";
import { ApiError } from "../api/http";
import { streamContinue } from "../api/sse";
import type {
  InterruptEnvelope,
  RunError,
  RunStatus,
  SessionStateResponse,
  SessionStatusResponse,
} from "../types/api";
import type { SseEvent } from "../types/sse";

const TERMINAL: ReadonlySet<string> = new Set(["completed", "failed", "cancelled"]);

const ACTIVE: ReadonlySet<string> = new Set([
  "ingesting",
  "planning",
  "awaiting_approval",
  "generating",
  "reviewing",
  "assembling",
]);

export type ReconnectDecision =
  | { kind: "paused"; interrupt: InterruptEnvelope; runStatus: string | null }
  | {
      kind: "needs_continue";
      next: string[];
      runStatus: string | null;
      message: string;
    }
  | { kind: "completed"; runStatus: "completed" }
  | { kind: "failed"; runStatus: "failed"; message: string | null }
  | { kind: "cancelled"; runStatus: "cancelled" }
  | { kind: "server_running"; runStatus: string; message: string }
  | { kind: "idle"; runStatus: string | null };

export type ReconnectSnapshot = {
  status: SessionStatusResponse;
  state: SessionStateResponse;
  decision: ReconnectDecision;
};

export function runErrorMessage(error: RunError | string | null | undefined): string | null {
  if (error == null) return null;
  if (typeof error === "string") return error || null;
  if (typeof error === "object" && typeof error.message === "string") return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return "Run failed";
  }
}

/**
 * Pure reconnect classifier (task 11 recovery flow).
 * Interrupt wins; else non-empty `next` → `/continue`; else terminal / active / idle.
 */
export function classifySessionReconnect(input: {
  status: SessionStatusResponse;
  state: SessionStateResponse;
}): ReconnectDecision {
  const runStatus =
    (input.status.run_status as string | null) ??
    (typeof input.state.values?.run_status === "string"
      ? input.state.values.run_status
      : null);
  const interrupt = input.state.interrupt;
  const next = Array.isArray(input.state.next) ? input.state.next : [];

  if (interrupt) {
    return { kind: "paused", interrupt, runStatus };
  }

  if (runStatus === "completed") {
    return { kind: "completed", runStatus: "completed" };
  }
  if (runStatus === "failed") {
    return {
      kind: "failed",
      runStatus: "failed",
      message: runErrorMessage(input.state.values?.error ?? null),
    };
  }
  if (runStatus === "cancelled") {
    return { kind: "cancelled", runStatus: "cancelled" };
  }

  if (next.length > 0 && !TERMINAL.has(runStatus ?? "")) {
    return {
      kind: "needs_continue",
      next,
      runStatus,
      message:
        "Run was interrupted by the disconnect — resume from the last checkpoint?",
    };
  }

  if (runStatus && ACTIVE.has(runStatus)) {
    return {
      kind: "server_running",
      runStatus,
      message:
        "Run in progress on server — live preview unavailable until the next pause or completion.",
    };
  }

  return { kind: "idle", runStatus };
}

export async function fetchReconnectSnapshot(threadId: string): Promise<ReconnectSnapshot> {
  const [status, state] = await Promise.all([
    getSessionStatus(threadId),
    getSessionState(threadId),
  ]);
  return {
    status,
    state,
    decision: classifySessionReconnect({ status, state }),
  };
}

export type UseSessionReconnectOptions = {
  threadId: string;
  onEvent: (ev: SseEvent) => void;
  onBeginStream?: () => void;
  onStreamEvent?: (ev: SseEvent) => void;
};

export type UseSessionReconnectResult = {
  continuing: boolean;
  continueError: string | null;
  clearContinueError: () => void;
  /** POST /sessions/{id}/continue — opens a new SSE stream. */
  continueFromCheckpoint: () => Promise<{ ok: boolean; error: string | null }>;
  abortContinue: () => void;
};

/**
 * Checkpoint recovery via `POST /continue` (no stream re-attach).
 * Live BE may still 404 this route — callers should surface the error and keep polling.
 */
export function useSessionReconnect(
  options: UseSessionReconnectOptions
): UseSessionReconnectResult {
  const { threadId, onEvent, onBeginStream, onStreamEvent } = options;
  const [continuing, setContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const onEventRef = useRef(onEvent);
  const onBeginStreamRef = useRef(onBeginStream);
  const onStreamEventRef = useRef(onStreamEvent);
  onEventRef.current = onEvent;
  onBeginStreamRef.current = onBeginStream;
  onStreamEventRef.current = onStreamEvent;

  const abortContinue = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const continueFromCheckpoint = useCallback(async (): Promise<{
    ok: boolean;
    error: string | null;
  }> => {
    if (continuing) return { ok: false, error: null };
    abortContinue();
    const controller = new AbortController();
    abortRef.current = controller;
    setContinuing(true);
    setContinueError(null);

    try {
      onBeginStreamRef.current?.();
      await streamContinue(
        threadId,
        {
          onEvent: (ev) => {
            onStreamEventRef.current?.(ev);
            onEventRef.current?.(ev);
          },
        },
        controller.signal
      );
      return { ok: true, error: null };
    } catch (err) {
      if (controller.signal.aborted) return { ok: false, error: null };
      let message = "Continue failed";
      if (err instanceof ApiError) {
        if (err.status === 404) {
          message = `${err.detail} POST /continue is unavailable on this API build — wait for the next pause, or cancel and restart.`;
        } else if (err.status === 409) {
          message = `${err.detail} The run may already be cancelled or mid-execution — refresh state before retrying.`;
        } else {
          message = err.detail;
        }
      } else if (err instanceof Error) {
        message = err.message;
      }
      setContinueError(message);
      return { ok: false, error: message };
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setContinuing(false);
    }
  }, [abortContinue, continuing, threadId]);

  return {
    continuing,
    continueError,
    clearContinueError: () => setContinueError(null),
    continueFromCheckpoint,
    abortContinue,
  };
}

export type { RunStatus };
