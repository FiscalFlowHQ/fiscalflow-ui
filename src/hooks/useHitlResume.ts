import { useCallback, useRef, useState } from "react";
import { getSessionState } from "../api/fiscalflow";
import { ApiError } from "../api/http";
import { streamResume } from "../api/sse";
import { envelopeKey, resumeInterruptId } from "../components/hitl/hitlContent";
import type { InterruptEnvelope, ResumeRequest } from "../types/api";
import type { SseEvent } from "../types/sse";

export { envelopeKey } from "../components/hitl/hitlContent";

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
};

export type ResumeOptions = {
  auto?: boolean;
  /** Envelope being answered — used for history + stack removal when id is empty. */
  envelope?: InterruptEnvelope;
};

export type UseHitlResumeResult = {
  stack: InterruptEnvelope[];
  history: HitlHistoryEntry[];
  current: InterruptEnvelope | null;
  resuming: boolean;
  resumeError: string | null;
  bulkApprovePlans: boolean;
  setBulkApprovePlans: (value: boolean) => void;
  pushInterrupt: (envelope: InterruptEnvelope) => void;
  clearStack: () => void;
  clearResumeError: () => void;
  resume: (request: ResumeRequest, opts?: ResumeOptions) => Promise<boolean>;
  /** Abort an in-flight resume SSE (cancel / unmount). */
  abort: () => void;
};

export function useHitlResume(options: UseHitlResumeOptions): UseHitlResumeResult {
  const { threadId, onEvent, onStreamEvent, onBeginStream } = options;

  const [stack, setStack] = useState<InterruptEnvelope[]>([]);
  const [history, setHistory] = useState<HitlHistoryEntry[]>([]);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [bulkApprovePlans, setBulkApprovePlansState] = useState(false);

  const inFlightId = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bulkRef = useRef(bulkApprovePlans);
  bulkRef.current = bulkApprovePlans;

  const setBulkApprovePlans = useCallback((value: boolean) => {
    bulkRef.current = value;
    setBulkApprovePlansState(value);
  }, []);

  const onEventRef = useRef(onEvent);
  const onStreamEventRef = useRef(onStreamEvent);
  const onBeginStreamRef = useRef(onBeginStream);
  onEventRef.current = onEvent;
  onStreamEventRef.current = onStreamEvent;
  onBeginStreamRef.current = onBeginStream;

  const resumeFn = useRef<(req: ResumeRequest, opts?: ResumeOptions) => Promise<boolean>>(
    async () => false
  );

  const resume = useCallback(
    async (request: ResumeRequest, opts?: ResumeOptions): Promise<boolean> => {
      const envelope = opts?.envelope;
      const id =
        request.interrupt_id ||
        (envelope ? resumeInterruptId(envelope) : "unknown");
      const body: ResumeRequest = {
        ...request,
        interrupt_id: id,
      };

      if (inFlightId.current === id) {
        return false;
      }
      inFlightId.current = id;
      setResuming(true);
      setResumeError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        onBeginStreamRef.current?.();
        await streamResume(
          threadId,
          body,
          {
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

        return true;
      } catch (err) {
        if (controller.signal.aborted) {
          return false;
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
              return false;
            }
            if (state.interrupt) {
              setStack([state.interrupt]);
              setResumeError(
                "This interrupt was already answered or is stale. Showing the current pause from GET /state — do not blind-retry."
              );
            } else {
              setStack([]);
              setResumeError(
                "No pending interrupt on the server (resume was stale or already applied)."
              );
            }
          } catch (stateErr) {
            setResumeError(
              stateErr instanceof ApiError
                ? stateErr.detail
                : "Resume conflict (409); failed to refetch GET /state."
            );
          }
          return false;
        }

        if (err instanceof ApiError) {
          setResumeError(err.detail);
        } else if (err instanceof Error) {
          setResumeError(err.message);
        } else {
          setResumeError("Resume failed");
        }
        return false;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (inFlightId.current === id) inFlightId.current = null;
        setResuming(false);
      }
    },
    [threadId]
  );

  resumeFn.current = resume;

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    inFlightId.current = null;
    setResuming(false);
  }, []);

  const pushInterrupt = useCallback((envelope: InterruptEnvelope) => {
    const key = envelopeKey(envelope);

    setStack((prev) => {
      if (prev.some((e) => envelopeKey(e) === key)) return prev;
      return [...prev, envelope];
    });

    if (
      bulkRef.current &&
      envelope.phase === "plan" &&
      envelope.allowed_actions.includes("approve")
    ) {
      queueMicrotask(() => {
        void resumeFn.current(
          {
            action: "approve",
            interrupt_id: resumeInterruptId(envelope),
          },
          { auto: true, envelope }
        );
      });
    }
  }, []);

  const clearStack = useCallback(() => {
    setStack([]);
    setResumeError(null);
    inFlightId.current = null;
  }, []);

  return {
    stack,
    history,
    current: stack[0] ?? null,
    resuming,
    resumeError,
    bulkApprovePlans,
    setBulkApprovePlans,
    pushInterrupt,
    clearStack,
    clearResumeError: () => setResumeError(null),
    resume,
    abort,
  };
}
