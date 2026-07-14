import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { checkHealth } from "../api/fiscalflow";
import { useSessionList } from "../hooks/useSessionList";
import { runStatusBadge } from "../lib/runStatusBadge";
import type { LocalSession } from "../types/session";

type HealthState = "checking" | "ok" | "down";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function truncateRef(ref: string): string {
  if (ref.length <= 22) return ref;
  return `${ref.slice(0, 10)}…${ref.slice(-8)}`;
}

function SessionCard({
  session,
  onOpen,
  onDelete,
}: {
  session: LocalSession;
  onOpen: (threadId: string) => void;
  onDelete: (threadId: string) => void;
}) {
  const badge = runStatusBadge({
    lastRunStatus: session.lastRunStatus,
    paused: session.paused,
  });

  return (
    <article className="session-card">
      <button
        type="button"
        className="session-card__main"
        aria-label={`Open ${session.title}`}
        onClick={() => onOpen(session.threadId)}
      >
        <div className="session-card__top">
          <h2 className="session-card__title">{session.title}</h2>
          <span className={`status-chip status-chip--${badge.key}`}>{badge.label}</span>
        </div>
        <p className="session-card__meta">Created {formatWhen(session.createdAt)}</p>
        {session.documentRef ? (
          <p className="session-card__ref" title={session.documentRef}>
            Databook {truncateRef(session.documentRef)}
          </p>
        ) : (
          <p className="session-card__ref session-card__ref--empty">No databook yet</p>
        )}
      </button>
      <button
        type="button"
        className="session-card__delete"
        aria-label={`Delete ${session.title}`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(session.threadId);
        }}
      >
        Remove
      </button>
    </article>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const [health, setHealth] = useState<HealthState>("checking");
  const {
    sessions,
    creating,
    refreshing,
    createError,
    createNewSession,
    openSession,
    deleteSession,
  } = useSessionList();

  useEffect(() => {
    let cancelled = false;

    async function probe() {
      try {
        const res = await checkHealth();
        if (!cancelled) setHealth(res.status === "ok" ? "ok" : "down");
      } catch {
        if (!cancelled) setHealth("down");
      }
    }

    void probe();
    return () => {
      cancelled = true;
    };
  }, []);

  const backendOk = health === "ok";
  const statusLabel =
    health === "checking"
      ? "Checking backend…"
      : health === "ok"
        ? "Backend online"
        : "Backend offline";

  async function onNewRun() {
    const threadId = await createNewSession();
    if (threadId) navigate(`/run/${threadId}`);
  }

  function onOpen(threadId: string) {
    openSession(threadId);
    navigate(`/run/${threadId}`);
  }

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-header__copy">
          <h1 className="home-title">FiscalFlow</h1>
          <p className="home-subtitle">Generate FDD documents from Excel databooks.</p>
        </div>
        <div className="home-header__actions">
          <button
            type="button"
            className="btn-primary"
            disabled={!backendOk || creating}
            onClick={() => void onNewRun()}
          >
            {creating ? "Creating…" : "New FDD run"}
          </button>
          <div className={`health-dot health-dot--${health}`} role="status" aria-live="polite">
            <span className="health-dot__indicator" aria-hidden />
            <span>{statusLabel}</span>
          </div>
        </div>
      </header>

      {health === "down" && (
        <div className="home-banner" role="alert">
          Backend is offline. You can still browse local sessions; creating a new run needs the API
          on port 8000.
        </div>
      )}

      {createError && (
        <div className="home-banner home-banner--error" role="alert">
          {createError}
        </div>
      )}

      <section className="session-list" aria-label="Sessions">
        <div className="session-list__head">
          <h2 className="session-list__title">Sessions</h2>
          {refreshing && <span className="session-list__hint">Refreshing status…</span>}
        </div>

        {sessions.length === 0 ? (
          <div className="session-empty">
            <p>No FDD runs yet.</p>
            <p>Start a new run to create a session thread on the backend.</p>
          </div>
        ) : (
          <ul className="session-list__items">
            {sessions.map((session) => (
              <li key={session.threadId}>
                <SessionCard session={session} onOpen={onOpen} onDelete={deleteSession} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="home-legacy">
        <Link to="/upload">Legacy Excel auditor</Link>
      </p>
    </div>
  );
}
