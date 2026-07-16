import { useEffect, useMemo, useRef, useState } from "react";
import type { InterruptEnvelope, ResumeRequest } from "../../types/api";
import EvidenceBundleView from "../artifacts/EvidenceBundleView";
import MarkdownView from "../artifacts/MarkdownView";
import {
  canAct,
  formatAttemptBadge,
  getReviewPayload,
  hitlTitle,
  parseEditedContent,
  parseOpenQuestions,
  planTextFromContent,
  resumeInterruptId,
  stepLabel,
  valueToEditorText,
} from "./hitlContent";

export type InterruptCardProps = {
  envelope: InterruptEnvelope;
  busy?: boolean;
  error?: string | null;
  onResume: (request: ResumeRequest, envelope: InterruptEnvelope) => void;
};

export default function InterruptCard({
  envelope,
  busy = false,
  error = null,
  onResume,
}: InterruptCardProps) {
  const payload = useMemo(() => getReviewPayload(envelope.content), [envelope.content]);
  const planText = useMemo(() => planTextFromContent(envelope.content), [envelope.content]);
  const questions = useMemo(() => parseOpenQuestions(envelope.content), [envelope.content]);
  const attemptBadge = formatAttemptBadge(payload.attempt);

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(() => valueToEditorText(payload.value));
  const [reason, setReason] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const title = hitlTitle(envelope);
  const step = stepLabel(envelope.step_id);

  useEffect(() => {
    // Keyboard: land focus on the primary approve (or answer) action when a new pause opens.
    const id = window.setTimeout(() => primaryRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [envelope.interrupt_id, envelope.phase, envelope.step_id, envelope.section_id]);

  function submit(action: ResumeRequest["action"]) {
    setLocalError(null);
    if (!canAct(envelope, action) && envelope.allowed_actions.length > 0) {
      setLocalError(`Action "${action}" is not allowed for this pause.`);
      return;
    }

    if (action === "reject" && !reason.trim()) {
      setLocalError("Add a short reason — it improves the regenerated output.");
      return;
    }

    if (action === "answer") {
      if (questions.length === 0) {
        setLocalError("No clarification questions in this envelope.");
        return;
      }
      const edited_content = {
        answers: questions.map((q) => ({
          id: q.id,
          answer: answers[q.id] ?? "",
        })),
      };
      onResume(
        {
          action: "answer",
          interrupt_id: resumeInterruptId(envelope),
          edited_content,
        },
        envelope
      );
      return;
    }

    if (action === "edit") {
      const edited_content = parseEditedContent(payload.outputKey, editText, payload.value);
      onResume(
        {
          action: "edit",
          interrupt_id: resumeInterruptId(envelope),
          edited_content,
        },
        envelope
      );
      return;
    }

    if (action === "reject") {
      onResume(
        {
          action: "reject",
          interrupt_id: resumeInterruptId(envelope),
          reason: reason.trim(),
          // Live BE currently only reads edited_content for feedback — send both.
          edited_content: { reason: reason.trim() },
        },
        envelope
      );
      return;
    }

    onResume(
      {
        action: "approve",
        interrupt_id: resumeInterruptId(envelope),
      },
      envelope
    );
  }

  return (
    <article className="hitl-card" aria-label={title}>
      <header className="hitl-card__head">
        <div className="hitl-card__titles">
          <h3 className="hitl-card__title">{title}</h3>
          <p className="hitl-card__meta">
            <span className="status-chip">{envelope.tier}</span>
            <span className="status-chip">{envelope.phase}</span>
            {envelope.section_id && (
              <span className="hitl-card__section">{envelope.section_id}</span>
            )}
            {step && <span className="hitl-card__step">{step}</span>}
            {attemptBadge && (
              <span className="status-chip status-chip--awaiting_review">{attemptBadge}</span>
            )}
          </p>
        </div>
      </header>

      <div className="hitl-card__body">
        {envelope.phase === "clarification" ? (
          <div className="hitl-clarify">
            {questions.length === 0 ? (
              <p className="hitl-card__empty">No open questions provided.</p>
            ) : (
              questions.map((q) => (
                <label key={q.id} className="hitl-clarify__q">
                  <span>{q.prompt}</span>
                  <textarea
                    rows={2}
                    value={answers[q.id] ?? ""}
                    disabled={busy}
                    onChange={(e) =>
                      setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                    }
                  />
                </label>
              ))
            )}
          </div>
        ) : envelope.phase === "plan" ? (
          <div className="hitl-plan">
            <p className="hitl-card__hint">
              Approving this plan is the cheap gate — it prevents wasted generation tokens.
            </p>
            {editing ? (
              <textarea
                className="hitl-editor"
                rows={12}
                value={editText}
                disabled={busy}
                onChange={(e) => setEditText(e.target.value)}
              />
            ) : (
              <MarkdownView
                source={planText}
                empty="_Empty plan_"
                className="markdown-view hitl-markdown"
              />
            )}
          </div>
        ) : (
          <div className="hitl-review">
            {payload.outputKey && payload.outputKey !== "evidence_bundle" && (
              <p className="hitl-card__hint">
                Output key <code>{payload.outputKey}</code>
              </p>
            )}
            {payload.outputKey === "evidence_bundle" && !editing ? (
              <EvidenceBundleView bundle={payload.value} compact />
            ) : editing || typeof payload.value !== "string" ? (
              <textarea
                className="hitl-editor"
                rows={14}
                value={editText}
                disabled={busy}
                onChange={(e) => setEditText(e.target.value)}
              />
            ) : (
              <MarkdownView
                source={payload.value}
                empty="_Empty_"
                className="markdown-view hitl-markdown"
              />
            )}
          </div>
        )}

        {canAct(envelope, "reject") && (
          <label className="hitl-reason">
            <span>Reject reason</span>
            <textarea
              rows={2}
              value={reason}
              disabled={busy}
              placeholder="What should change on the next attempt?"
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
      </div>

      {(localError || error) && (
        <div className="hitl-card__error" role="alert">
          {localError ?? error}
        </div>
      )}

      <footer className="hitl-card__actions">
        {envelope.allowed_actions.length === 0 && (
          <p className="hitl-card__hint">Read-only pause (no allowed actions).</p>
        )}

        {canAct(envelope, "edit") && (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => {
              if (!editing) {
                setEditText(valueToEditorText(payload.value));
                setEditing(true);
              } else {
                submit("edit");
              }
            }}
          >
            {editing ? (busy ? "Submitting…" : "Submit edit") : "Edit"}
          </button>
        )}

        {editing && (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            Cancel edit
          </button>
        )}

        {canAct(envelope, "reject") && (
          <button
            type="button"
            className="btn-secondary hitl-btn-reject"
            disabled={busy}
            onClick={() => submit("reject")}
          >
            {busy ? "Resuming…" : "Reject"}
          </button>
        )}

        {canAct(envelope, "answer") && (
          <button
            ref={!canAct(envelope, "approve") ? primaryRef : undefined}
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => submit("answer")}
          >
            {busy ? "Resuming…" : "Submit answers"}
          </button>
        )}

        {canAct(envelope, "approve") && (
          <button
            ref={primaryRef}
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => submit("approve")}
          >
            {busy ? "Resuming…" : "Approve"}
          </button>
        )}
      </footer>
    </article>
  );
}
