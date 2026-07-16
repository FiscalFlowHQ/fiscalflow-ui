import ErrorBanner from "../components/feedback/ErrorBanner";
import { Link, useParams } from "react-router-dom";
import ArtifactPanel from "../components/artifacts/ArtifactPanel";
import ChatPanel from "../components/chat/ChatPanel";
import DatabookPanel from "../components/databook/DatabookPanel";
import PipelineRail from "../components/pipeline/PipelineRail";
import RunComposer from "../components/run/RunComposer";
import {
  orchestratorPhaseChip,
  orchestratorPhaseLabel,
  useRunOrchestrator,
} from "../hooks/useRunOrchestrator";
import "../styles/run-workspace.css";

/** Integrated FDD run workspace — layout + lifecycle + chat (tasks 10–12). */
export default function RunPage() {
  const { threadId = "" } = useParams<{ threadId: string }>();
  const run = useRunOrchestrator(threadId);

  if (!threadId) {
    return (
      <div className="page-stub">
        <h1>Run workspace</h1>
        <p>Missing thread id.</p>
      </div>
    );
  }

  const layoutClass = [
    "run-workspace",
    "run-page__layout",
    "run-page__layout--workspace",
    run.phase === "paused" ? "run-workspace--paused" : "",
    run.phase === "server_running" || run.phase === "needs_continue"
      ? "run-workspace--server-running"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="run-page run-workspace-page">
      <header className="run-page__header run-workspace__header">
        <div>
          <nav className="run-workspace__breadcrumb" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span className="run-workspace__breadcrumb-sep" aria-hidden>
              /
            </span>
            <span>{run.sessionTitle}</span>
          </nav>
          <h1 className="run-page__title">{run.sessionTitle}</h1>
          <p className="run-page__thread">
            Thread <code>{threadId}</code>
          </p>
        </div>
        <div className="run-workspace__header-actions">
          <span
            className={`status-chip status-chip--${orchestratorPhaseChip(run.phase)}`}
          >
            {orchestratorPhaseLabel(run.phase)}
          </span>
          <button
            type="button"
            className="btn-secondary run-workspace__cancel"
            disabled={run.cancelDisabled}
            onClick={() => {
              void run.cancelRun();
            }}
          >
            {run.cancelling ? "Cancelling…" : "Cancel"}
          </button>
        </div>
      </header>

      {run.offline && (
        <ErrorBanner
          tone="warn"
          title="You're offline"
          message="Network connection lost. Generation streams cannot continue until you're back online."
          onRetry={run.retryConnectivity}
          retryLabel="Retry"
        />
      )}

      {run.streamError && run.phase === "failed" && (
        <ErrorBanner
          tone="error"
          title="Generation error"
          message={run.streamError}
          onRetry={() => {
            void run.viewState();
          }}
          retryLabel="View state"
          onDismiss={run.clearStreamError}
        />
      )}

      {run.banner && (
        <ErrorBanner
          tone={run.bannerTone === "error" ? "error" : run.bannerTone === "warn" ? "warn" : "info"}
          message={run.banner}
          onDismiss={run.dismissBanner}
          onRetry={
            run.offerContinue
              ? () => {
                  void run.continueFromCheckpoint();
                }
              : undefined
          }
          retryLabel={run.continuing ? "Resuming…" : "Continue run"}
        />
      )}

      {run.continueError && !run.banner && (
        <ErrorBanner
          tone="warn"
          message={run.continueError}
          onDismiss={run.clearContinueError}
        />
      )}

      <div className={layoutClass}>
        <PipelineRail state={run.pipeline.state} />

          <ChatPanel
          className="chat-panel--main"
          entries={run.transcript.entries}
          hitl={run.hitl}
          activityStatus={
            run.continuing
              ? "Continuing from checkpoint…"
              : run.hitl.resuming
                ? "Submitting decision…"
                : run.phase === "streaming"
                  ? "Generation running…"
                  : run.phase === "server_running"
                    ? "Run in progress on server…"
                    : null
          }
          onResume={(request, envelope) => run.resumeRun(request, envelope)}
          onSendInstruction={run.sendInstruction}
          sendingInstruction={run.sendingInstruction}
          instructionError={run.instructionError}
          onClearInstructionError={run.clearInstructionError}
          onExport={() => {
            void run.exportTranscript();
          }}
        />

        <div className="run-page__col run-workspace__sidebar">
          {run.hydrated ? (
            <DatabookPanel
              key={threadId}
              threadId={threadId}
              initialDocumentRef={run.documentRef}
              onDocumentRef={run.setDocumentRef}
              onReadyChange={(ready, ref) => run.setDatabookReady(ready, ref)}
            />
          ) : (
            <section className="databook-panel" aria-busy="true">
              <header className="databook-panel__head">
                <h2 className="databook-panel__title">Databook</h2>
              </header>
              <p className="databook-dropzone__hint">Restoring session…</p>
            </section>
          )}
          <RunComposer
            databookReady={run.databookReady}
            documentRef={run.documentRef}
            locked={run.locked}
            starting={run.starting}
            startError={run.startError}
            onStart={(body) => {
              void run.startRun(body);
            }}
            onClearStartError={run.clearStartError}
          />
          <ArtifactPanel artifacts={run.artifacts} />
        </div>
      </div>
    </div>
  );
}
