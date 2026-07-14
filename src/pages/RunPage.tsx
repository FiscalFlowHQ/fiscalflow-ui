import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ArtifactPanel from "../components/artifacts/ArtifactPanel";
import DatabookPanel from "../components/databook/DatabookPanel";
import InterruptStack from "../components/hitl/InterruptStack";
import PipelineRail from "../components/pipeline/PipelineRail";
import RunComposer from "../components/run/RunComposer";
import { useArtifactState } from "../hooks/useArtifactState";
import { useHitlResume } from "../hooks/useHitlResume";
import { usePipelineProgress } from "../hooks/usePipelineProgress";
import { useStartRun } from "../hooks/useStartRun";
import {
  createLocalSession,
  loadSessions,
  patchSession,
  touchOpened,
  upsertSession,
} from "../stores/sessionStore";
import type { InterruptEnvelope, ResumeRequest } from "../types/api";
import type { SseEvent } from "../types/sse";

/** Run workspace shell — rail + artifacts + databook/composer/HITL. */
export default function RunPage() {
  const { threadId = "" } = useParams<{ threadId: string }>();

  const sessionDocumentRef = useMemo(() => {
    if (!threadId) return null;
    return loadSessions().find((s) => s.threadId === threadId)?.documentRef ?? null;
  }, [threadId]);

  const [documentRef, setDocumentRef] = useState<string | null>(sessionDocumentRef);
  const [databookReady, setDatabookReady] = useState(false);

  const pipeline = usePipelineProgress({ threadId, pollStatus: true });
  const { reset: resetPipeline, applyEvent: applyPipelineEvent, state: pipelineState } =
    pipeline;

  const artifacts = useArtifactState({ threadId });

  const pushInterruptRef = useRef<(envelope: InterruptEnvelope) => void>(() => {});
  const beginExternalStreamRef = useRef<() => void>(() => {});
  const observeStreamEventRef = useRef<(ev: SseEvent) => void>(() => {});
  const applyArtifactEventRef = useRef<(ev: SseEvent) => void>(() => {});
  const seedArtifactInterruptRef = useRef<(envelope: InterruptEnvelope) => void>(() => {});

  const onSseEvent = useCallback(
    (ev: SseEvent) => {
      console.debug("[fiscalflow sse]", ev);
      applyArtifactEventRef.current(ev);
      applyPipelineEvent(ev);
      if (ev.type === "interrupt") {
        pushInterruptRef.current(ev.envelope);
        seedArtifactInterruptRef.current(ev.envelope);
        patchSession(threadId, { paused: true, lastRunStatus: "awaiting_approval" });
      } else if (ev.type === "done") {
        patchSession(threadId, { paused: false, lastRunStatus: "completed" });
      } else if (ev.type === "error") {
        patchSession(threadId, { paused: false, lastRunStatus: "failed" });
      } else if (ev.type === "step") {
        patchSession(threadId, { paused: false, lastRunStatus: "generating" });
      }
    },
    [applyPipelineEvent, threadId]
  );

  const startRun = useStartRun({
    threadId,
    onEvent: onSseEvent,
  });

  const hitl = useHitlResume({
    threadId,
    onBeginStream: () => beginExternalStreamRef.current(),
    onStreamEvent: (ev) => observeStreamEventRef.current(ev),
    onEvent: onSseEvent,
  });

  pushInterruptRef.current = hitl.pushInterrupt;
  beginExternalStreamRef.current = startRun.beginExternalStream;
  observeStreamEventRef.current = startRun.observeStreamEvent;
  applyArtifactEventRef.current = artifacts.applyEvent;
  seedArtifactInterruptRef.current = artifacts.seedFromInterrupt;

  useEffect(() => {
    if (!threadId) return;
    const existing = loadSessions().some((s) => s.threadId === threadId);
    if (existing) {
      touchOpened(threadId);
    } else {
      upsertSession(createLocalSession(threadId));
    }
    setDocumentRef(sessionDocumentRef);
    setDatabookReady(false);
    resetPipeline([]);
    hitl.clearStack();
    startRun.reset();
    artifacts.reset();
    void artifacts.refreshState();
    // Reset workspace state when the route thread changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, sessionDocumentRef, resetPipeline]);

  const onDocumentRef = useCallback(
    (ref: string) => {
      setDocumentRef(ref);
      patchSession(threadId, { documentRef: ref });
    },
    [threadId]
  );

  const onReadyChange = useCallback((ready: boolean, ref: string | null) => {
    setDatabookReady(ready);
    if (ref) setDocumentRef(ref);
  }, []);

  const onResume = useCallback(
    (request: ResumeRequest, envelope: InterruptEnvelope) => {
      void hitl.resume(request, { envelope });
    },
    [hitl]
  );

  const showHitl =
    hitl.stack.length > 0 ||
    startRun.phase === "paused" ||
    Boolean(hitl.resumeError);

  if (!threadId) {
    return (
      <div className="page-stub">
        <h1>Run workspace</h1>
        <p>Missing thread id.</p>
      </div>
    );
  }

  return (
    <div className="run-page">
      <header className="run-page__header">
        <div>
          <p className="run-page__eyebrow">
            <Link to="/">← Sessions</Link>
          </p>
          <h1 className="run-page__title">Run workspace</h1>
          <p className="run-page__thread">
            Thread <code>{threadId}</code>
          </p>
        </div>
        {startRun.phase !== "idle" && (
          <span className={`status-chip status-chip--${startRunPhaseChip(startRun.phase)}`}>
            {startRunPhaseLabel(startRun.phase)}
          </span>
        )}
      </header>

      <div className="run-page__layout run-page__layout--workspace">
        <PipelineRail state={pipelineState} />
        <ArtifactPanel artifacts={artifacts} />

        <div className="run-page__col">
          <DatabookPanel
            key={threadId}
            threadId={threadId}
            initialDocumentRef={sessionDocumentRef}
            onDocumentRef={onDocumentRef}
            onReadyChange={onReadyChange}
          />
          <RunComposer
            databookReady={databookReady}
            documentRef={documentRef}
            locked={startRun.locked}
            starting={startRun.starting}
            startError={startRun.error}
            onStart={(body) => {
              hitl.clearStack();
              artifacts.reset();
              resetPipeline(body.selected_sections);
              void startRun.start(body);
            }}
            onClearStartError={() => {
              if (startRun.phase === "error") startRun.reset();
            }}
          />

          {showHitl && (
            <InterruptStack
              current={hitl.current}
              queueLength={hitl.stack.length}
              resuming={hitl.resuming}
              resumeError={hitl.resumeError}
              bulkApprovePlans={hitl.bulkApprovePlans}
              onBulkApproveChange={hitl.setBulkApprovePlans}
              onResume={onResume}
              onDismissError={hitl.clearResumeError}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function startRunPhaseChip(
  phase: ReturnType<typeof useStartRun>["phase"]
): string {
  switch (phase) {
    case "paused":
      return "awaiting_review";
    case "done":
      return "complete";
    case "error":
      return "failed";
    default:
      return "running";
  }
}

function startRunPhaseLabel(phase: ReturnType<typeof useStartRun>["phase"]): string {
  switch (phase) {
    case "starting":
      return "Starting…";
    case "streaming":
      return "Running…";
    case "paused":
      return "Awaiting review";
    case "done":
      return "Complete";
    case "error":
      return "Failed";
    default:
      return phase;
  }
}
