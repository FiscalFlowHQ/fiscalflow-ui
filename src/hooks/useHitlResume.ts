import { useCallback, useRef, useState } from "react";
import { getSessionState, patchHitlSettings } from "../api/fiscalflow";
import { ApiError } from "../api/http";
import { streamResume } from "../api/sse";
import {
  envelopeKey,
  isPlanGate,
  resumeInterruptId,
} from "../components/hitl/hitlContent";
import type { InterruptEnvelope, ResumeRequest } from "../types/api";
import type { SseEvent } from "../types/sse";

export { envelopeKey } from "../components/hitl/hitlContent";
export { isPlanGate } from "../components/hitl/hitlContent";

export type HitlHistoryEntry = {
  envelope: InterruptEnvelope;
  resolvedAt: string;
  action: ResumeRequest["action"];
  auto?: boolean;
};

export type UseHitlResumeOptions = {
  threadId: string;
  onEvent?: (ev: SseEvent) => void;
  onStreamEvent?: (ev: SseEvent) => void;
  onBeginStream?: () => void;
  /**
   * Fired after a resume SSE finishes (success or error), not on abort.
   * Used by the orchestrator to clear stale live-stream flags and reclassify.
   */
  onStreamSettled?: () => void | Promise<void>;
  /**
   * Resume 409 with no pending interrupt — checkpoint is mid-node; caller should
   * POST /continue instead of showing a stale Approve card.
   */
  onOrphanedCheckpoint?: () => void;
};

export type ResumeOptions = {
  auto?: boolean;
  /** Envelope being answered — used for history + stack removal when id is empty. */
  envelope?: InterruptEnvelope;
};

export type ResumeResult = {
  ok: boolean;
  /** Resume 409 with no pending interrupt — caller should POST /continue once. */
  orphaned: boolean;
};

export type UseHitlResumeResult = {
  stack: InterruptEnvelope[];
  history: HitlHistoryEntry[];
  current: InterruptEnvelope | null;
  resuming: boolean;
  resumeError: string | null;
  bulkApprovePlans: boolean;
  setBulkApprovePlans: (value: boolean) => void;
  /** Set bulk flag without PATCH (Start already applied policy on the server). */
  syncBulkApprovePlans: (value: boolean) => void;
  pushInterrupt: (envelope: InterruptEnvelope) => void;
  clearStack: () => void;
  clearResumeError: () => void;
  resume: (request: ResumeRequest, opts?: ResumeOptions) => Promise<ResumeResult>;
  /** Abort an in-flight resume SSE (cancel / unmount). */
  abort: () => void;
};

function enqueueUnique(
  queue: InterruptEnvelope[],
  envelope: InterruptEnvelope
): InterruptEnvelope[] {
  const key = envelopeKey(envelope);
  if (queue.some((e) => envelopeKey(e) === key)) return queue;
  return [...queue, envelope];
}

export function useHitlResume(options: UseHitlResumeOptions): UseHitlResumeResult {
  const {
    threadId,
    onEvent,
    onStreamEvent,
    onBeginStream,
    onStreamSettled,
    onOrphanedCheckpoint,
  } = options;

  const [stack, setStack] = useState<InterruptEnvelope[]>([]);
  const [history, setHistory] = useState<HitlHistoryEntry[]>([]);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [bulkApprovePlans, setBulkApprovePlansState] = useState(false);

  const inFlightId = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingBulkRef = useRef<InterruptEnvelope[]>([]);
  const stackRef = useRef<InterruptEnvelope[]>([]);
  stackRef.current = stack;
  const bulkRef = useRef(bulkApprovePlans);
  bulkRef.current = bulkApprovePlans;

  const resumeFn = useRef<
    (req: ResumeRequest, opts?: ResumeOptions) => Promise<ResumeResult>
  >(async () => ({ ok: false, orphaned: false }));

  /** Local-only (no PATCH) — used when Start already sent auto_approve_plans. */
  const syncBulkApprovePlans = useCallback((value: boolean) => {
    bulkRef.current = value;
    setBulkApprovePlansState(value);
    if (!value) pendingBulkRef.current = [];
  }, []);

  const setBulkApprovePlans = useCallback((value: boolean) => {
    bulkRef.current = value;
    setBulkApprovePlansState(value);
    if (!value) pendingBulkRef.current = [];

    // Capture the open card at toggle time — only that gate is auto-approved after PATCH.
    // New interrupts arriving via pushInterrupt are handled there (avoids double resume).
    const pendingCurrent = stackRef.current[0] ?? null;

    void (async () => {
      try {
        await patchHitlSettings(threadId, { auto_approve_plans: value });
      } catch (err) {
        // Roll back UI if the server rejected the toggle.
        bulkRef.current = !value;
        setBulkApprovePlansState(!value);
        setResumeError(
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : "Failed to update auto-approve setting"
        );
        return;
      }

      if (!value || !pendingCurrent) return;

      const current = stackRef.current[0] ?? null;
      if (
        current &&
        envelopeKey(current) === envelopeKey(pendingCurrent) &&
        isPlanGate(current) &&
        current.allowed_actions.includes("approve") &&
        inFlightId.current === null
      ) {
        queueMicrotask(() => {
          if (inFlightId.current !== null) return;
          void resumeFn.current(
            {
              action: "approve",
              interrupt_id: resumeInterruptId(current),
            },
            { auto: true, envelope: current }
          );
        });
      }
    })();
  }, [threadId]);

  const onEventRef = useRef(onEvent);
  const onStreamEventRef = useRef(onStreamEvent);
  const onBeginStreamRef = useRef(onBeginStream);
  const onStreamSettledRef = useRef(onStreamSettled);
  const onOrphanedCheckpointRef = useRef(onOrphanedCheckpoint);
  onEventRef.current = onEvent;
  onStreamEventRef.current = onStreamEvent;
  onBeginStreamRef.current = onBeginStream;
  onStreamSettledRef.current = onStreamSettled;
  onOrphanedCheckpointRef.current = onOrphanedCheckpoint;

  const drainPendingBulk = useCallback(() => {
    if (!bulkRef.current || inFlightId.current !== null) return;
    const next = pendingBulkRef.current[0];
    if (!next) return;
    pendingBulkRef.current = pendingBulkRef.current.slice(1);
    void resumeFn.current(
      {
        action: "approve",
        interrupt_id: resumeInterruptId(next),
      },
      { auto: true, envelope: next }
    );
  }, []);

  const resume = useCallback(
    async (request: ResumeRequest, opts?: ResumeOptions): Promise<ResumeResult> => {
      const envelope = opts?.envelope;
      const id =
        request.interrupt_id ||
        (envelope ? resumeInterruptId(envelope) : "unknown");
      const body: ResumeRequest = {
        ...request,
        interrupt_id: id,
      };

      // Serialize all resumes — parallel POSTs race the server registry (409) and
      // leave the UI streaming with a dead SSE.
      if (inFlightId.current !== null) {
        if (opts?.auto && envelope && bulkRef.current) {
          pendingBulkRef.current = enqueueUnique(pendingBulkRef.current, envelope);
        }
        return { ok: false, orphaned: false };
      }

      inFlightId.current = id;
      setResuming(true);
      setResumeError(null);

      const controller = new AbortController();
      abortRef.current = controller;
      let aborted = false;
      let orphaned = false;

      try {
        await streamResume(
          threadId,
          body,
          {
            onOpen: () => {
              onBeginStreamRef.current?.();
            },
            onEvent: (ev) => {
              onStreamEventRef.current?.(ev);
              onEventRef.current?.(ev);
            },
          },
          controller.signal
        );

        setStack((prev) =>
          prev.filter((e) => {
            const key = envelopeKey(e);
            if (body.interrupt_id && e.interrupt_id === body.interrupt_id) return false;
            if (key === id) return false;
            return true;
          })
        );

        if (envelope) {
          setHistory((prev) => [
            ...prev,
            {
              envelope,
              resolvedAt: new Date().toISOString(),
              action: request.action,
              auto: opts?.auto,
            },
          ]);
        }

        return { ok: true, orphaned: false };
      } catch (err) {
        if (controller.signal.aborted) {
          aborted = true;
          return { ok: false, orphaned: false };
        }
        if (err instanceof ApiError && err.status === 409) {
          try {
            const state = await getSessionState(threadId);
            const statusHint =
              typeof state.values?.run_status === "string"
                ? state.values.run_status
                : null;
            if (statusHint === "cancelled") {
              setStack([]);
              setResumeError(
                "This run was cancelled and cannot be resumed. Start a new generation from the composer."
              );
              return { ok: false, orphaned: false };
            }
            if (state.interrupt) {
              setStack([state.interrupt]);
              setResumeError(
                "This interrupt was already answered or is stale. Showing the current pause from GET /state — do not blind-retry."
              );
            } else {
              // Mid-node orphan: Approve has nowhere to go — /continue re-drives.
              setStack([]);
              setResumeError(null);
              orphaned = true;
            }
          } catch (stateErr) {
            setResumeError(
              stateErr instanceof ApiError
                ? stateErr.detail
                : "Resume conflict (409); failed to refetch GET /state."
            );
          }
          return { ok: false, orphaned };
        }

        if (err instanceof ApiError) {
          setResumeError(err.detail);
        } else if (err instanceof Error) {
          setResumeError(err.message);
        } else {
          setResumeError("Resume failed");
        }
        return { ok: false, orphaned: false };
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (inFlightId.current === id) inFlightId.current = null;
        const keepBusy =
          bulkRef.current && pendingBulkRef.current.length > 0;
        setResuming(keepBusy);
        if (!aborted) {
          if (orphaned) {
            onOrphanedCheckpointRef.current?.();
          }
          // Always settle so phase reflects GET /state (paused / needs_continue / …).
          await onStreamSettledRef.current?.();
          queueMicrotask(() => {
            drainPendingBulk();
          });
        }
      }
    },
    [drainPendingBulk, threadId]
  );

  resumeFn.current = resume;

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    inFlightId.current = null;
    pendingBulkRef.current = [];
    setResuming(false);
  }, []);

  const pushInterrupt = useCallback(
    (envelope: InterruptEnvelope) => {
      const key = envelopeKey(envelope);

      setStack((prev) => {
        if (prev.some((e) => envelopeKey(e) === key)) return prev;
        return [...prev, envelope];
      });

      if (
        bulkRef.current &&
        isPlanGate(envelope) &&
        envelope.allowed_actions.includes("approve")
      ) {
        // Optimistic busy so the plan card shows "Resuming…" immediately.
        setResuming(true);
        if (inFlightId.current !== null) {
          pendingBulkRef.current = enqueueUnique(pendingBulkRef.current, envelope);
          return;
        }
        // Defer past the current SSE turn so the prior resume can deregister first.
        queueMicrotask(() => {
          if (inFlightId.current !== null) {
            pendingBulkRef.current = enqueueUnique(pendingBulkRef.current, envelope);
            return;
          }
          void resumeFn.current(
            {
              action: "approve",
              interrupt_id: resumeInterruptId(envelope),
            },
            { auto: true, envelope }
          );
        });
      }
    },
    []
  );

  const clearStack = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStack([]);
    setResumeError(null);
    inFlightId.current = null;
    pendingBulkRef.current = [];
    setResuming(false);
  }, []);

  return {
    stack,
    history,
    current: stack[0] ?? null,
    resuming,
    resumeError,
    bulkApprovePlans,
    setBulkApprovePlans,
    syncBulkApprovePlans,
    pushInterrupt,
    clearStack,
    clearResumeError: () => setResumeError(null),
    resume,
    abort,
  };
}
