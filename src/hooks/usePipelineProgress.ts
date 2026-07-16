import { useCallback, useEffect, useReducer, useRef } from "react";
import { getSessionStatus } from "../api/fiscalflow";
import type { SseEvent } from "../types/sse";
import {
  createInitialPipelineState,
  type PipelineState,
} from "../components/pipeline/pipelineModel";
import {
  hydratePipelineState,
  type PipelineHydrateInput,
} from "../components/pipeline/pipelineHydrate";
import { pipelineReducer } from "../components/pipeline/pipelineReducer";

const STATUS_POLL_MS = 4000;

export type UsePipelineProgressOptions = {
  threadId?: string;
  /** When true, poll GET /status as a pause-resilience fallback (BE acceptance #24). */
  pollStatus?: boolean;
};

export type UsePipelineProgressResult = {
  state: PipelineState;
  reset: (selectedSections: string[]) => void;
  /** Rebuild rail from GET /state checkpoint (reconnect / Continue). */
  hydrate: (input: PipelineHydrateInput) => void;
  applyEvent: (ev: SseEvent) => void;
};

export function usePipelineProgress(
  options: UsePipelineProgressOptions = {}
): UsePipelineProgressResult {
  const { threadId, pollStatus = false } = options;
  const [state, dispatch] = useReducer(
    pipelineReducer,
    undefined,
    () => createInitialPipelineState([])
  );
  const runningRef = useRef(false);

  const reset = useCallback((selectedSections: string[]) => {
    runningRef.current = true;
    dispatch({ type: "reset", selectedSections });
  }, []);

  const hydrate = useCallback((input: PipelineHydrateInput) => {
    runningRef.current = true;
    dispatch({ type: "hydrate", input });
  }, []);

  const applyEvent = useCallback((ev: SseEvent) => {
    if (ev.type === "done" || ev.type === "error") {
      runningRef.current = false;
    } else if (ev.type === "step" || ev.type === "interrupt") {
      runningRef.current = true;
    }
    dispatch({ type: "sse", event: ev });
  }, []);

  useEffect(() => {
    if (!pollStatus || !threadId) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled || !runningRef.current) return;
      try {
        const status = await getSessionStatus(threadId);
        if (cancelled) return;
        if (status.run_status === "awaiting_approval") {
          dispatch({ type: "status_hint", awaitingApproval: true });
        }
      } catch {
        /* soft fallback — rail should not break on poll errors */
      }
    };

    const id = setInterval(() => {
      void tick();
    }, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollStatus, threadId]);

  return { state, reset, hydrate, applyEvent };
}

export type { PipelineHydrateInput };
export { hydratePipelineState };
