import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DatabookPanel from "../components/databook/DatabookPanel";
import RunComposer from "../components/run/RunComposer";
import { useStartRun } from "../hooks/useStartRun";
import {
  createLocalSession,
  loadSessions,
  patchSession,
  touchOpened,
  upsertSession,
} from "../stores/sessionStore";
import type { SseEvent } from "../types/sse";

/** Run workspace shell — databook + composer; rail/HITL in later tasks. */
export default function RunPage() {
  const { threadId = "" } = useParams<{ threadId: string }>();

  const sessionDocumentRef = useMemo(() => {
    if (!threadId) return null;
    return loadSessions().find((s) => s.threadId === threadId)?.documentRef ?? null;
  }, [threadId]);

  const [documentRef, setDocumentRef] = useState<string | null>(sessionDocumentRef);
  const [databookReady, setDatabookReady] = useState(false);
  const [sseLog, setSseLog] = useState<SseEvent[]>([]);

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
    setSseLog([]);
  }, [threadId, sessionDocumentRef]);

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

  const onSseEvent = useCallback(
    (ev: SseEvent) => {
      // Task 07+ consumes these; keep a small buffer + console for manual QA.
      console.debug("[fiscalflow sse]", ev);
      setSseLog((prev) => [...prev, ev].slice(-40));
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

  const startRun = useStartRun({
    threadId,
    onEvent: onSseEvent,
  });

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

      <div className="run-page__body">
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
            onStart={(body) => void startRun.start(body)}
            onClearStartError={() => {
              if (startRun.phase === "error") startRun.reset();
            }}
          />
        </div>
        <aside className="run-page__aside" aria-label="Stream preview">
          <h2>Stream preview</h2>
          <p>
            Pipeline rail and HITL review land in tasks 07–08. SSE events from Start are
            logged here for verification.
          </p>
          {documentRef && (
            <p className="run-page__aside-ref">
              Active ref <code>{documentRef}</code>
            </p>
          )}
          {sseLog.length === 0 ? (
            <p className="run-composer__hint">No events yet.</p>
          ) : (
            <ul className="sse-preview">
              {sseLog.map((ev, i) => (
                <li key={`${ev.type}-${i}`}>
                  <code>{formatSsePreview(ev)}</code>
                </li>
              ))}
            </ul>
          )}
        </aside>
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

function formatSsePreview(ev: SseEvent): string {
  switch (ev.type) {
    case "step":
      return `step ${ev.node}${ev.namespace.length ? ` [${ev.namespace.join("/")}]` : ""}`;
    case "token":
      return `token ${JSON.stringify(ev.text.slice(0, 48))}`;
    case "interrupt":
      return `interrupt ${ev.envelope.tier}/${ev.envelope.phase}`;
    case "done":
      return "done";
    case "error":
      return `error ${ev.message}`;
  }
}
