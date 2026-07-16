import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelRun as apiCancelRun,
  getDocumentStatus,
  sendInstruction as apiSendInstruction,
} from "../api/fiscalflow";
import { ApiError } from "../api/http";
import { useOptionalToast } from "../components/feedback/Toast";
import { resumeInterruptId } from "../components/hitl/hitlContent";
import { useArtifactState, type UseArtifactStateResult } from "./useArtifactState";
import { useHitlResume, type UseHitlResumeResult } from "./useHitlResume";
import {
  usePipelineProgress,
  type UsePipelineProgressResult,
} from "./usePipelineProgress";
import {
  fetchReconnectSnapshot,
  runErrorMessage,
  useSessionReconnect,
  type ReconnectDecision,
} from "./useSessionReconnect";
import { useStartRun } from "./useStartRun";
import { useTranscript, type UseTranscriptResult } from "./useTranscript";
import {
  createLocalSession,
  loadSessions,
  patchSession,
  touchOpened,
  upsertSession,
} from "../stores/sessionStore";
import type {
  InterruptEnvelope,
  ResumeRequest,
  RunStatus,
  SessionStateResponse,
  StartGenerationRequest,
} from "../types/api";
import type { SseEvent } from "../types/sse";
import type { PipelineHydrateInput } from "./usePipelineProgress";

/** Poll interval for `server_running` recovery. */
export const ORCHESTRATOR_POLL_MS = 4000;

export type OrchestratorPhase =
  | "no_document"
  | "ready"
  | "streaming"
  | "paused"
  | "server_running"
  | "needs_continue"
  | "completed"
  | "failed"
  | "cancelled";

export type UseRunOrchestratorResult = {
  phase: OrchestratorPhase;
  /** True after local session + reconnect/databook restore finished. */
  hydrated: boolean;
  runStatus: RunStatus | string | null;
  banner: string | null;
  bannerTone: "info" | "error" | "warn";
  dismissBanner: () => void;
  /** CTA for disconnect recovery (`POST /continue`). */
  offerContinue: boolean;
  continuing: boolean;
  continueError: string | null;
  continueFromCheckpoint: () => Promise<void>;
  clearContinueError: () => void;
  sessionTitle: string;
  documentRef: string | null;
  databookReady: boolean;
  setDatabookReady: (ready: boolean, ref?: string | null) => void;
  setDocumentRef: (ref: string) => void;
  locked: boolean;
  starting: boolean;
  startError: string | null;
  clearStartError: () => void;
  pipeline: UsePipelineProgressResult;
  artifacts: UseArtifactStateResult;
  hitl: UseHitlResumeResult;
  transcript: UseTranscriptResult;
  sendInstruction: (text: string) => Promise<void>;
  sendingInstruction: boolean;
  instructionError: string | null;
  clearInstructionError: () => void;
  exportTranscript: () => Promise<void>;
  startRun: (body: StartGenerationRequest) => Promise<void>;
  resumeRun: (request: ResumeRequest, envelope: InterruptEnvelope) => void;
  cancelDisabled: boolean;
  cancelling: boolean;
  cancelRun: () => Promise<void>;
  /** Offline sticky banner. */
  offline: boolean;
  retryConnectivity: () => void;
  /** Last SSE error message (surface via ErrorBanner). */
  streamError: string | null;
  clearStreamError: () => void;
  viewState: () => Promise<void>;
};

/**
 * Central run-workspace orchestrator: phase machine, SSE fan-out, reconnect, cancel.
 */
export function useRunOrchestrator(
  threadId: string,
  options?: { pollMs?: number }
): UseRunOrchestratorResult {
  const pollMs = options?.pollMs ?? ORCHESTRATOR_POLL_MS;
  const toast = useOptionalToast();

  const [phase, setPhase] = useState<OrchestratorPhase>("no_document");
  const [runStatus, setRunStatus] = useState<RunStatus | string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [bannerTone, setBannerTone] = useState<"info" | "error" | "warn">("info");
  const [offerContinue, setOfferContinue] = useState(false);
  const [sessionTitle, setSessionTitle] = useState(`FDD run · ${threadId.slice(0, 8)}`);
  const [documentRef, setDocumentRefState] = useState<string | null>(null);
  const [databookReady, setDatabookReadyState] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [sendingInstruction, setSendingInstruction] = useState(false);
  const [instructionError, setInstructionError] = useState<string | null>(null);
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const [streamError, setStreamError] = useState<string | null>(null);

  const sseLiveRef = useRef(false);
  const startInFlightRef = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  /** Keep phaseRef in sync immediately so awaiters after settle see the new phase. */
  const setPhaseNow = useCallback((next: OrchestratorPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);
  const historyLenRef = useRef(0);

  const pipeline = usePipelineProgress({ threadId, pollStatus: true });
  const artifacts = useArtifactState({ threadId, pollMs });
  const transcript = useTranscript(threadId);
  const transcriptApplyRef = useRef(transcript.applyEvent);
  const transcriptLogSystemRef = useRef(transcript.logSystem);
  const transcriptLogDecisionRef = useRef(transcript.logDecision);
  const transcriptClearRef = useRef(transcript.clearForNewRun);
  transcriptApplyRef.current = transcript.applyEvent;
  transcriptLogSystemRef.current = transcript.logSystem;
  transcriptLogDecisionRef.current = transcript.logDecision;
  transcriptClearRef.current = transcript.clearForNewRun;

  const pushInterruptRef = useRef<(e: InterruptEnvelope) => void>(() => {});
  const beginExternalStreamRef = useRef<() => void>(() => {});
  const observeStreamEventRef = useRef<(ev: SseEvent) => void>(() => {});
  const applyArtifactEventRef = useRef<(ev: SseEvent) => void>(() => {});
  const seedArtifactInterruptRef = useRef<(e: InterruptEnvelope) => void>(() => {});
  const clearHitlRef = useRef<() => void>(() => {});
  const abortHitlRef = useRef<() => void>(() => {});
  const syncBulkApproveRef = useRef<(value: boolean) => void>(() => {});
  const resetPipelineRef = useRef<(sections: string[]) => void>(() => {});
  const hydratePipelineRef = useRef<(input: PipelineHydrateInput) => void>(() => {});
  const resetArtifactsRef = useRef<() => void>(() => {});
  const refreshArtifactsRef = useRef<() => Promise<void>>(async () => {});
  const loadReportRef = useRef<() => Promise<void>>(async () => {});
  const settleExternalStreamRef = useRef<() => Promise<void>>(async () => {});
  const applyReconnectSnapshotRef = useRef<
    (opts?: { fromPoll?: boolean }) => Promise<ReconnectDecision>
  >(async () => ({ kind: "idle", runStatus: null }));
  const databookLoggedRef = useRef<string | null>(null);
  const continueFromCheckpointRef = useRef<() => Promise<void>>(async () => {});


  const applySessionPatch = useCallback(
    (ev: SseEvent) => {
      if (ev.type === "interrupt") {
        patchSession(threadId, { paused: true, lastRunStatus: "awaiting_approval" });
      } else if (ev.type === "done") {
        patchSession(threadId, { paused: false, lastRunStatus: "completed" });
      } else if (ev.type === "error") {
        patchSession(threadId, { paused: false, lastRunStatus: "failed" });
      } else if (ev.type === "step") {
        patchSession(threadId, { paused: false, lastRunStatus: "generating" });
      }
    },
    [threadId]
  );

  const onSseEvent = useCallback(
    (ev: SseEvent) => {
      if (import.meta.env.DEV) {
        console.debug("[fiscalflow sse]", ev);
      }
      applyArtifactEventRef.current(ev);
      pipeline.applyEvent(ev);
      applySessionPatch(ev);
      transcriptApplyRef.current(ev);

      if (ev.type === "interrupt") {
        pushInterruptRef.current(ev.envelope);
        seedArtifactInterruptRef.current(ev.envelope);
        sseLiveRef.current = false;
        setPhaseNow("paused");
        setRunStatus("awaiting_approval");
        setBanner(null);
        setOfferContinue(false);
        setStreamError(null);
      } else if (ev.type === "done") {
        sseLiveRef.current = false;
        setPhaseNow("completed");
        setRunStatus("completed");
        setBanner(null);
        setOfferContinue(false);
        setStreamError(null);
      } else if (ev.type === "error") {
        sseLiveRef.current = false;
        setPhaseNow("failed");
        setRunStatus("failed");
        setOfferContinue(false);
        setStreamError(ev.message);
        setBanner(null);
        toast?.pushToast({
          tone: "error",
          message: ev.message || "Generation failed",
          actionLabel: "View state",
          onAction: () => {
            void refreshArtifactsRef.current();
          },
        });
      } else if (ev.type === "step" || ev.type === "token") {
        if (sseLiveRef.current) {
          setPhaseNow("streaming");
          setOfferContinue(false);
        }
      }
    },
    [applySessionPatch, pipeline, setPhaseNow, toast]
  );

  const startHook = useStartRun({
    threadId,
    onEvent: onSseEvent,
  });

  const hitl = useHitlResume({
    threadId,
    onBeginStream: () => {
      sseLiveRef.current = true;
      beginExternalStreamRef.current();
      setPhaseNow("streaming");
      setBanner(null);
      setOfferContinue(false);
      transcriptLogSystemRef.current("Decision submitted — generation resuming…");
    },
    onStreamEvent: (ev) => observeStreamEventRef.current(ev),
    onEvent: onSseEvent,
    onStreamSettled: () => settleExternalStreamRef.current(),
    onOrphanedCheckpoint: () => {
      clearHitlRef.current();
    },
  });

  const reconnect = useSessionReconnect({
    threadId,
    onEvent: onSseEvent,
    onBeginStream: () => {
      sseLiveRef.current = true;
      beginExternalStreamRef.current();
      setPhaseNow("streaming");
      setBanner(null);
      setOfferContinue(false);
      // Activity strip covers Continue UX — avoid duplicate transcript spam.
    },
    onStreamEvent: (ev) => observeStreamEventRef.current(ev),
  });

  pushInterruptRef.current = hitl.pushInterrupt;
  clearHitlRef.current = hitl.clearStack;
  abortHitlRef.current = hitl.abort;
  syncBulkApproveRef.current = hitl.syncBulkApprovePlans;
  beginExternalStreamRef.current = startHook.beginExternalStream;
  observeStreamEventRef.current = startHook.observeStreamEvent;
  applyArtifactEventRef.current = artifacts.applyEvent;
  seedArtifactInterruptRef.current = artifacts.seedFromInterrupt;
  resetPipelineRef.current = pipeline.reset;
  hydratePipelineRef.current = pipeline.hydrate;
  resetArtifactsRef.current = artifacts.reset;
  refreshArtifactsRef.current = artifacts.refreshState;
  loadReportRef.current = artifacts.loadReport;

  // Log HITL decisions (incl. bulk auto-approves) into the transcript.
  useEffect(() => {
    const hist = hitl.history;
    if (hist.length <= historyLenRef.current) {
      historyLenRef.current = Math.min(historyLenRef.current, hist.length);
      return;
    }
    for (let i = historyLenRef.current; i < hist.length; i++) {
      const h = hist[i]!;
      const interruptId = resumeInterruptId(h.envelope);
      if (h.auto) {
        transcriptLogSystemRef.current(
          `Auto-approved plan gate · ${h.envelope.section_id || interruptId}`
        );
      }
      transcriptLogDecisionRef.current({
        action: h.action,
        interruptId,
        auto: h.auto,
      });
    }
    historyLenRef.current = hist.length;
  }, [hitl.history]);

  const applyDecision = useCallback(
    (decision: ReconnectDecision, snap: SessionStateResponse) => {
      const stateSections = Array.isArray(snap.values?.selected_sections)
        ? snap.values.selected_sections.filter((s): s is string => typeof s === "string")
        : [];

      if (stateSections.length) {
        const completedRaw = snap.values?.completed_sections;
        const completedSectionIds = Array.isArray(completedRaw)
          ? completedRaw
              .map((s) =>
                s && typeof s === "object" && typeof (s as { id?: unknown }).id === "string"
                  ? (s as { id: string }).id
                  : null
              )
              .filter((id): id is string => !!id)
          : [];
        const stepTrace = Array.isArray(snap.section_state?.step_trace)
          ? snap.section_state.step_trace.filter((id): id is string => typeof id === "string")
          : [];
        const interrupt =
          decision.kind === "paused"
            ? decision.interrupt
            : snap.interrupt ?? null;

        hydratePipelineRef.current({
          selectedSections: stateSections,
          currentSectionIndex:
            typeof snap.values?.current_section_index === "number"
              ? snap.values.current_section_index
              : null,
          stepTrace,
          interrupt,
          next: Array.isArray(snap.next) ? snap.next : [],
          runStatus:
            decision.runStatus ??
            (typeof snap.values?.run_status === "string" ? snap.values.run_status : null),
          completedSectionIds,
        });
      }

      switch (decision.kind) {
        case "paused":
          pushInterruptRef.current(decision.interrupt);
          seedArtifactInterruptRef.current(decision.interrupt);
          transcriptApplyRef.current({
            type: "interrupt",
            interruptId:
              decision.interrupt.interrupt_id ||
              resumeInterruptId(decision.interrupt),
            envelope: decision.interrupt,
          });
          {
            const meta = snap.values?.metadata;
            if (meta && typeof meta === "object") {
              const flag = (meta as { auto_approve_plans?: unknown }).auto_approve_plans;
              if (typeof flag === "boolean") {
                syncBulkApproveRef.current(flag);
              }
            }
          }
          setPhaseNow("paused");
          setRunStatus(decision.runStatus);
          setBanner(null);
          setOfferContinue(false);
          patchSession(threadId, {
            paused: true,
            lastRunStatus: (decision.runStatus as RunStatus) ?? "awaiting_approval",
          });
          break;
        case "needs_continue":
          // Stale pause cards must not survive an orphan mid-node — Approve would 409.
          clearHitlRef.current();
          setPhaseNow("needs_continue");
          setRunStatus(decision.runStatus);
          setBanner(decision.message);
          setBannerTone("warn");
          setOfferContinue(true);
          patchSession(threadId, {
            paused: false,
            lastRunStatus: (decision.runStatus as RunStatus) ?? "generating",
          });
          break;
        case "completed":
          clearHitlRef.current();
          setPhaseNow("completed");
          setRunStatus("completed");
          setBanner(null);
          setOfferContinue(false);
          patchSession(threadId, { paused: false, lastRunStatus: "completed" });
          void loadReportRef.current();
          break;
        case "failed":
          clearHitlRef.current();
          setPhaseNow("failed");
          setRunStatus("failed");
          setOfferContinue(false);
          setStreamError(decision.message);
          setBanner(decision.message ?? "Run failed");
          setBannerTone("error");
          patchSession(threadId, { paused: false, lastRunStatus: "failed" });
          break;
        case "cancelled":
          clearHitlRef.current();
          setPhaseNow("cancelled");
          setRunStatus("cancelled");
          setBanner(null);
          setOfferContinue(false);
          patchSession(threadId, { paused: false, lastRunStatus: "cancelled" });
          break;
        case "server_running":
          clearHitlRef.current();
          setPhaseNow("server_running");
          setRunStatus(decision.runStatus);
          setBanner(decision.message);
          setBannerTone("info");
          setOfferContinue(false);
          patchSession(threadId, {
            paused: false,
            lastRunStatus: (decision.runStatus as RunStatus) ?? "generating",
          });
          break;
        case "idle":
          clearHitlRef.current();
          setOfferContinue(false);
          setBanner(null);
          patchSession(threadId, {
            paused: false,
            lastRunStatus: (decision.runStatus as RunStatus) ?? null,
          });
          break;
      }
    },
    [setPhaseNow, threadId]
  );

  const applyReconnectSnapshot = useCallback(
    async (opts?: { fromPoll?: boolean }) => {
      const snap = await fetchReconnectSnapshot(threadId);
      setRunStatus(snap.status.run_status ?? null);
      await refreshArtifactsRef.current();

      if (opts?.fromPoll && snap.decision.kind === "idle") {
        setBanner(null);
        return snap.decision;
      }

      if (!opts?.fromPoll || snap.decision.kind !== "idle") {
        applyDecision(snap.decision, snap.state);
      }
      return snap.decision;
    },
    [applyDecision, threadId]
  );

  applyReconnectSnapshotRef.current = applyReconnectSnapshot;

  /**
   * After start/resume/continue SSE ends: reclassify from GET /state.
   * Skip no-op re-applies when already paused on an interrupt (avoids layout thrash).
   * Retry once when we just paused via SSE but GET still looks orphaned (checkpoint race).
   */
  const settleExternalStream = useCallback(async () => {
    const current = phaseRef.current;
    if (
      current === "completed" ||
      current === "failed" ||
      current === "cancelled"
    ) {
      sseLiveRef.current = false;
      return;
    }

    sseLiveRef.current = false;
    try {
      let snap = await fetchReconnectSnapshot(threadId);
      setRunStatus(snap.status.run_status ?? null);
      await refreshArtifactsRef.current();

      // Interrupt arrived on SSE but checkpoint may lag a beat — don't wipe the card.
      if (current === "paused" && snap.decision.kind === "needs_continue") {
        await new Promise((r) => setTimeout(r, 200));
        snap = await fetchReconnectSnapshot(threadId);
        setRunStatus(snap.status.run_status ?? null);
      }

      if (snap.decision.kind === "paused" && current === "paused") {
        // Pause already on screen from the SSE interrupt — avoid re-hydrate flicker.
        return;
      }

      // SSE showed a pause but GET still has no interrupt after retry: keep the card
      // rather than flashing back to the Continue banner (checkpoint race).
      if (current === "paused" && snap.decision.kind === "needs_continue") {
        setOfferContinue(true);
        setBanner(
          "Run may still be catching up — try Approve on the card, or Continue if Approve fails."
        );
        setBannerTone("warn");
        return;
      }

      applyDecision(snap.decision, snap.state);
    } catch {
      setPhaseNow("failed");
      setStreamError("Stream ended unexpectedly — could not refresh session state.");
      setBanner("Stream ended unexpectedly — could not refresh session state.");
      setBannerTone("error");
    }
  }, [applyDecision, setPhaseNow, threadId]);

  settleExternalStreamRef.current = settleExternalStream;

  useEffect(() => {
    if (!threadId) return;

    let cancelled = false;
    sseLiveRef.current = false;
    startInFlightRef.current = false;
    databookLoggedRef.current = null;
    setHydrated(false);
    setBanner(null);
    setOfferContinue(false);
    setStreamError(null);
    reconnect.abortContinue();

    const existing = loadSessions().find((s) => s.threadId === threadId);
    const restoredRef = existing?.documentRef ?? null;
    if (existing) {
      touchOpened(threadId);
      setSessionTitle(existing.title);
      setDocumentRefState(restoredRef);
    } else {
      const created = createLocalSession(threadId);
      upsertSession(created);
      setSessionTitle(created.title);
      setDocumentRefState(null);
    }

    setDatabookReadyState(false);
    clearHitlRef.current();
    abortHitlRef.current();
    startHook.reset();
    resetArtifactsRef.current();
    resetPipelineRef.current([]);

    void (async () => {
      try {
        // Re-verify a previously ingested databook so Start unlocks after navigation.
        if (restoredRef && !cancelled) {
          try {
            const doc = await getDocumentStatus(restoredRef);
            if (!cancelled && doc.status === "ready") {
              setDatabookReadyState(true);
              setDocumentRefState(restoredRef);
            }
          } catch {
            /* DatabookPanel will keep polling / show failure */
          }
        }
        if (cancelled) return;
        await applyReconnectSnapshot();
      } catch (err) {
        if (cancelled) return;
        if (!(err instanceof ApiError && (err.status === 404 || err.status === 400))) {
          if (import.meta.env.DEV) {
            console.debug("[orchestrator] reconnect check failed", err);
          }
        }
        // 404/400 = no generation run yet (ingest-only session). Do not force
        // no_document — databook readiness drives the composer gate.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
      reconnect.abortContinue();
      abortHitlRef.current();
      startHook.abort();
    };
    // Intentionally thread-scoped remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    if (phase !== "server_running" || !threadId) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled || sseLiveRef.current) return;
      try {
        await applyReconnectSnapshot({ fromPoll: true });
      } catch {
        /* soft */
      }
    };

    const id = window.setInterval(() => {
      void tick();
    }, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase, threadId, applyReconnectSnapshot, pollMs]);

  // While showing a pause card, periodically verify the server still has that interrupt.
  // If the pause is gone, clear the ghost card and offer Continue — never auto-POST
  // /continue from this poll (that looped and flickered the whole workspace).
  useEffect(() => {
    if (phase !== "paused" || !threadId) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled || sseLiveRef.current) return;
      try {
        const snap = await fetchReconnectSnapshot(threadId);
        if (cancelled) return;
        if (snap.decision.kind === "paused") {
          const meta = snap.state.values?.metadata;
          if (meta && typeof meta === "object") {
            const flag = (meta as { auto_approve_plans?: unknown }).auto_approve_plans;
            if (typeof flag === "boolean") {
              syncBulkApproveRef.current(flag);
            }
          }
          return;
        }
        applyDecision(snap.decision, snap.state);
      } catch {
        /* soft */
      }
    };

    const id = window.setInterval(() => {
      void tick();
    }, Math.min(pollMs, 5000));
    void tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase, threadId, applyDecision, pollMs]);

  useEffect(() => {
    if (!hydrated) return;
    if (
      phase === "streaming" ||
      phase === "paused" ||
      phase === "server_running" ||
      phase === "needs_continue" ||
      phase === "completed" ||
      phase === "failed" ||
      phase === "cancelled"
    ) {
      return;
    }
    setPhase(databookReady ? "ready" : "no_document");
  }, [databookReady, hydrated, phase]);

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  const setDocumentRef = useCallback(
    (ref: string) => {
      setDocumentRefState(ref);
      patchSession(threadId, { documentRef: ref });
    },
    [threadId]
  );

  const setDatabookReady = useCallback(
    (ready: boolean, ref?: string | null) => {
      setDatabookReadyState(ready);
      if (ref) {
        setDocumentRefState(ref);
        patchSession(threadId, { documentRef: ref });
      }
      if (!ready) {
        databookLoggedRef.current = null;
        return;
      }
      const key = ref || "ready";
      if (databookLoggedRef.current === key) return;
      databookLoggedRef.current = key;
      transcriptLogSystemRef.current(
        ref ? `Databook ready (${ref}).` : "Databook ready."
      );
    },
    [threadId]
  );

  const startErrorRef = useRef(startHook.error);
  startErrorRef.current = startHook.error;

  const continueFromCheckpoint = useCallback(async () => {
    if (reconnect.continuing) return;
    reconnect.clearContinueError();
    // Stale live flag from a dead resume must not block Continue forever.
    sseLiveRef.current = false;
    setOfferContinue(false);
    const result = await reconnect.continueFromCheckpoint();
    await settleExternalStream();
    if (!result.ok && result.error) {
      setBannerTone("warn");
      setBanner(result.error);
      if (phaseRef.current === "needs_continue") {
        setOfferContinue(true);
      }
    }
  }, [reconnect, settleExternalStream]);

  continueFromCheckpointRef.current = continueFromCheckpoint;

  const startRun = useCallback(
    async (body: StartGenerationRequest) => {
      if (startInFlightRef.current || sseLiveRef.current) return;
      const blockedPhases: OrchestratorPhase[] = [
        "streaming",
        "server_running",
        "needs_continue",
        "paused",
      ];
      if (blockedPhases.includes(phaseRef.current)) return;

      if (!transcriptClearRef.current({ confirm: true })) return;

      startInFlightRef.current = true;
      sseLiveRef.current = true;
      historyLenRef.current = 0;
      clearHitlRef.current();
      syncBulkApproveRef.current(Boolean(body.auto_approve_plans));
      resetArtifactsRef.current();
      resetPipelineRef.current(body.selected_sections ?? []);
      setBanner(null);
      setOfferContinue(false);
      setStreamError(null);
      setInstructionError(null);
      setPhaseNow("streaming");
      setRunStatus("generating");
      transcriptLogSystemRef.current("Run started.");

      try {
        await startHook.start(body);
      } finally {
        startInFlightRef.current = false;
        const current = phaseRef.current;
        if (
          current !== "paused" &&
          current !== "completed" &&
          current !== "failed" &&
          current !== "cancelled" &&
          current !== "needs_continue" &&
          current !== "server_running"
        ) {
          sseLiveRef.current = false;
          if (current === "streaming") {
            const errMsg = startErrorRef.current ?? "";
            if (/already active/i.test(errMsg)) {
              try {
                await applyReconnectSnapshot();
                toast?.pushToast({
                  tone: "info",
                  message: "A run is already active — recovered session state.",
                });
              } catch {
                setPhase("failed");
              }
            } else if (errMsg) {
              setPhase("failed");
            } else {
              // Stream closed without interrupt/done/error — recover like resume.
              try {
                await applyReconnectSnapshot();
              } catch {
                setPhase("failed");
              }
            }
          }
        } else {
          sseLiveRef.current = false;
        }
      }
    },
    [applyReconnectSnapshot, startHook, toast]
  );

  const resumeRun = useCallback(
    (request: ResumeRequest, envelope: InterruptEnvelope) => {
      // Never silently ignore Approve — a stuck Continue flag used to make the
      // button look dead (no "Resuming…") while the card was already stale.
      if (startInFlightRef.current) return;
      if (reconnect.continuing) {
        reconnect.abortContinue();
      }

      void (async () => {
        const result = await hitl.resume(request, { envelope });

        // Proven 409 orphan — continue even if phase is still "paused" (resume never
        // opened a stream, so settle may have early-returned).
        if (result.orphaned) {
          transcriptLogSystemRef.current(
            "No pause left to approve — continuing from the last checkpoint…"
          );
          await continueFromCheckpointRef.current();
          return;
        }

        // Settle already ran inside resume finally — trust phase, do not re-fetch
        // with the broad next&&!interrupt heuristic (false orphan mid-run).
        const phase = phaseRef.current;
        if (
          phase === "paused" ||
          phase === "streaming" ||
          phase === "completed" ||
          phase === "failed" ||
          phase === "cancelled" ||
          phase === "server_running"
        ) {
          return;
        }

        if (phase !== "needs_continue") return;

        transcriptLogSystemRef.current(
          "Generation stopped mid-step — continuing from checkpoint…"
        );
        await continueFromCheckpointRef.current();
      })();
    },
    [hitl, reconnect]
  );

  const sendInstruction = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sendingInstruction) return;
      setSendingInstruction(true);
      setInstructionError(null);
      try {
        await apiSendInstruction(threadId, trimmed);
        transcript.logInstruction(trimmed);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.status === 404
              ? err.detail ||
                "Unknown session — mid-run instructions need an existing run on this thread."
              : err.detail
            : err instanceof Error
              ? err.message
              : "Failed to send instruction";
        setInstructionError(message);
        toast?.pushToast({ tone: "error", message });
      } finally {
        setSendingInstruction(false);
      }
    },
    [sendingInstruction, threadId, toast, transcript]
  );

  const exportTranscript = useCallback(async () => {
    const plain = transcript.exportPlainText();
    try {
      await navigator.clipboard.writeText(plain);
      toast?.pushToast({
        tone: "info",
        message: "Transcript copied to clipboard.",
      });
    } catch {
      toast?.pushToast({
        tone: "error",
        message: "Could not copy transcript.",
      });
    }
  }, [toast, transcript]);

  const cancelRun = useCallback(async () => {
    if (cancelling) return;
    const ok = window.confirm(
      "Cancel this run? You will not be able to resume or continue it."
    );
    if (!ok) return;

    setCancelling(true);
    try {
      startHook.abort();
      abortHitlRef.current();
      reconnect.abortContinue();
      sseLiveRef.current = false;

      const res = await apiCancelRun(threadId);
      clearHitlRef.current();
      setPhase("cancelled");
      setRunStatus(res.run_status);
      setBanner(null);
      setOfferContinue(false);
      setStreamError(null);
      patchSession(threadId, { paused: false, lastRunStatus: "cancelled" });
      toast?.pushToast({
        tone: "info",
        message: res.was_running
          ? "Run cancelled."
          : "Run cancelled (no live task was running — pause cleared).",
      });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.status === 404
            ? "Unknown session — nothing to cancel."
            : err.detail
          : err instanceof Error
            ? err.message
            : "Cancel failed";
      toast?.pushToast({ tone: "error", message });
      setBanner(message);
      setBannerTone("error");
    } finally {
      setCancelling(false);
    }
  }, [cancelling, reconnect, startHook, threadId, toast]);

  const locked =
    phase === "streaming" ||
    phase === "paused" ||
    phase === "server_running" ||
    phase === "needs_continue" ||
    phase === "completed" ||
    startHook.starting ||
    reconnect.continuing;

  const starting =
    phase === "streaming" &&
    (startHook.starting || hitl.resuming || reconnect.continuing);

  const cancelDisabled =
    cancelling ||
    phase === "no_document" ||
    phase === "ready" ||
    phase === "completed" ||
    phase === "cancelled";

  return {
    phase,
    hydrated,
    runStatus,
    banner,
    bannerTone,
    dismissBanner: () => setBanner(null),
    offerContinue,
    continuing: reconnect.continuing,
    continueError: reconnect.continueError,
    continueFromCheckpoint,
    clearContinueError: reconnect.clearContinueError,
    sessionTitle,
    documentRef,
    databookReady,
    setDatabookReady,
    setDocumentRef,
    locked,
    starting,
    startError: startHook.error,
    clearStartError: () => {
      if (startHook.phase === "error") startHook.reset();
      if (phase === "failed" || phase === "cancelled") {
        setPhase(databookReady ? "ready" : "no_document");
        setStreamError(null);
        setBanner(null);
      }
    },
    pipeline,
    artifacts,
    hitl,
    transcript,
    sendInstruction,
    sendingInstruction,
    instructionError,
    clearInstructionError: () => setInstructionError(null),
    exportTranscript,
    startRun,
    resumeRun,
    cancelDisabled,
    cancelling,
    cancelRun,
    offline,
    retryConnectivity: () => {
      setOffline(typeof navigator !== "undefined" ? !navigator.onLine : false);
      void applyReconnectSnapshot();
    },
    streamError,
    clearStreamError: () => setStreamError(null),
    viewState: async () => {
      await refreshArtifactsRef.current();
      artifacts.setTab("sections");
    },
  };
}

export function orchestratorPhaseChip(phase: OrchestratorPhase): string {
  switch (phase) {
    case "paused":
      return "awaiting_review";
    case "completed":
      return "complete";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "ready":
    case "no_document":
      return "draft";
    default:
      return "running";
  }
}

export function orchestratorPhaseLabel(phase: OrchestratorPhase): string {
  switch (phase) {
    case "no_document":
      return "Upload databook";
    case "ready":
      return "Ready";
    case "streaming":
      return "Streaming…";
    case "paused":
      return "Awaiting review";
    case "server_running":
      return "Running on server";
    case "needs_continue":
      return "Disconnected";
    case "completed":
      return "Complete";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return phase;
  }
}

/** @deprecated Prefer classifySessionReconnect — kept for existing tests. */
export function classifyReconnectStatus(
  runStatus: string | null,
  hasInterrupt: boolean,
  next: string[] = []
): OrchestratorPhase | "idle" {
  if (hasInterrupt) return "paused";
  if (runStatus === "completed") return "completed";
  if (runStatus === "failed") return "failed";
  if (runStatus === "cancelled") return "cancelled";
  if (next.length > 0 && runStatus !== "completed" && runStatus !== "failed" && runStatus !== "cancelled") {
    return "needs_continue";
  }
  if (
    runStatus === "ingesting" ||
    runStatus === "planning" ||
    runStatus === "awaiting_approval" ||
    runStatus === "generating" ||
    runStatus === "reviewing" ||
    runStatus === "assembling"
  ) {
    return "server_running";
  }
  return "idle";
}

export { runErrorMessage };
