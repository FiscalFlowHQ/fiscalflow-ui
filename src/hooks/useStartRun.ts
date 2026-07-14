import { useCallback, useRef, useState } from "react";
import { ApiError } from "../api/http";
import { streamStart } from "../api/sse";
import type { StartGenerationRequest } from "../types/api";
import type { SseEvent } from "../types/sse";

export type StartRunPhase =
  | "idle"
  | "starting"
  | "streaming"
  | "paused"
  | "done"
  | "error";

export type UseStartRunOptions = {
  threadId: string;
  /** Parent owns rail/HITL — this hook only forwards normalized SSE events. */
  onEvent?: (ev: SseEvent) => void;
  onClose?: () => void;
};

export type UseStartRunResult = {
  phase: StartRunPhase;
  error: string | null;
  /** True once start has been kicked off (composer should lock). */
  locked: boolean;
  starting: boolean;
  start: (body: StartGenerationRequest) => Promise<void>;
  abort: () => void;
  reset: () => void;
};

export function useStartRun(options: UseStartRunOptions): UseStartRunResult {
  const { threadId, onEvent, onClose } = options;
  const [phase, setPhase] = useState<StartRunPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onEventRef = useRef(onEvent);
  const onCloseRef = useRef(onClose);
  onEventRef.current = onEvent;
  onCloseRef.current = onClose;

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    abort();
    setPhase("idle");
    setError(null);
  }, [abort]);

  const start = useCallback(
    async (body: StartGenerationRequest) => {
      if (!body.selected_sections?.length) {
        setError("Select at least one section.");
        setPhase("error");
        return;
      }

      abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);
      setPhase("starting");

      try {
        setPhase("streaming");
        await streamStart(
          threadId,
          body,
          {
            onEvent: (ev) => {
              onEventRef.current?.(ev);
              if (ev.type === "interrupt") setPhase("paused");
              else if (ev.type === "done") setPhase("done");
              else if (ev.type === "error") {
                setError(ev.message);
                setPhase("error");
              }
            },
            onClose: () => {
              onCloseRef.current?.();
            },
          },
          controller.signal
        );
        setPhase((prev) => {
          if (prev === "streaming") return "done";
          return prev;
        });
      } catch (err) {
        if (controller.signal.aborted) {
          setPhase("idle");
          return;
        }
        if (err instanceof ApiError) {
          if (err.status === 409) {
            setError(
              `${err.detail} A run may already be active — use cancel/continue (task 11) to recover.`
            );
          } else if (err.status === 400) {
            setError(err.detail || "Invalid start request (empty or unknown sections).");
          } else {
            setError(err.detail);
          }
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to start generation");
        }
        setPhase("error");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [abort, threadId]
  );

  return {
    phase,
    error,
    locked: phase !== "idle" && phase !== "error",
    starting: phase === "starting" || phase === "streaming",
    start,
    abort,
    reset,
  };
}
