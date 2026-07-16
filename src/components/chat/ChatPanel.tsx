import { useEffect, useMemo, useRef } from "react";
import InterruptCard from "../hitl/InterruptCard";
import {
  envelopeKey,
  hitlTitle,
  isPlanGate,
  planTextFromContent,
  resumeInterruptId,
} from "../hitl/hitlContent";
import MarkdownView from "../artifacts/MarkdownView";
import type { UseHitlResumeResult } from "../../hooks/useHitlResume";
import type { TranscriptEntry } from "../../hooks/useTranscript";
import type { InterruptEnvelope, ResumeRequest } from "../../types/api";
import ChatComposer from "./Composer";

export type ChatPanelProps = {
  entries: TranscriptEntry[];
  hitl: UseHitlResumeResult;
  onResume: (request: ResumeRequest, envelope: InterruptEnvelope) => void;
  onSendInstruction: (text: string) => Promise<void>;
  sendingInstruction?: boolean;
  instructionError?: string | null;
  onClearInstructionError?: () => void;
  onExport: () => void;
  composerDisabled?: boolean;
  className?: string;
  /** Live activity line (resuming / streaming / continue). */
  activityStatus?: string | null;
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function DecisionLine({ entry }: { entry: Extract<TranscriptEntry, { kind: "decision" }> }) {
  return (
    <div className="chat-bubble chat-bubble--decision">
      <span className="chat-bubble__meta">{formatTime(entry.at)}</span>
      <p>
        {entry.auto ? "Auto-approved" : "Decision"}: <strong>{entry.action}</strong>
        {entry.reason ? ` — ${entry.reason}` : null}
      </p>
    </div>
  );
}

function previewText(envelope: InterruptEnvelope, max = 360): string {
  if (envelope.phase === "plan" || isPlanGate(envelope)) {
    const text = planTextFromContent(envelope.content).trim();
    if (!text) return "";
    return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
  }
  const keys = Object.keys(envelope.content).filter((k) => k !== "attempt");
  if (keys.length === 0) return "";
  return `Output ready (${keys.slice(0, 3).join(", ")}${keys.length > 3 ? "…" : ""}).`;
}

function findDecision(
  byId: Map<string, Extract<TranscriptEntry, { kind: "decision" }>>,
  envelope: InterruptEnvelope
): Extract<TranscriptEntry, { kind: "decision" }> | undefined {
  const id = envelope.interrupt_id;
  const key = envelopeKey(envelope);
  const resumeId = resumeInterruptId(envelope);
  return (
    (id ? byId.get(id) : undefined) ||
    byId.get(key) ||
    byId.get(resumeId)
  );
}

function ResolvedPause({
  envelope,
  decision,
  at,
}: {
  envelope: InterruptEnvelope;
  decision: Extract<TranscriptEntry, { kind: "decision" }>;
  at: string;
}) {
  const preview = previewText(envelope);
  return (
    <div className="chat-bubble chat-bubble--resolved">
      <span className="chat-bubble__meta">
        {formatTime(at)} · {hitlTitle(envelope)}
      </span>
      <p className="chat-resolved__decision">
        {decision.auto ? "Auto-approved" : "Decision"}:{" "}
        <strong>{decision.action}</strong>
        {decision.reason ? ` — ${decision.reason}` : null}
      </p>
      {preview ? (
        <div className="chat-resolved__preview">
          {envelope.phase === "plan" || isPlanGate(envelope) ? (
            <MarkdownView
              source={preview}
              className="markdown-view chat-resolved__md"
            />
          ) : (
            <p>{preview}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function HistoricalPause({
  envelope,
  at,
}: {
  envelope: InterruptEnvelope;
  at: string;
}) {
  const preview = previewText(envelope, 220);
  return (
    <div className="chat-bubble chat-bubble--system">
      <span className="chat-bubble__meta">
        {formatTime(at)} · {envelope.phase} · {envelope.tier}
        {envelope.section_id ? ` · ${envelope.section_id}` : ""}
      </span>
      {preview ? (
        <p className="chat-historical__preview">{preview}</p>
      ) : (
        <p>Earlier pause (no longer active).</p>
      )}
    </div>
  );
}

export default function ChatPanel({
  entries,
  hitl,
  onResume,
  onSendInstruction,
  sendingInstruction = false,
  instructionError = null,
  onClearInstructionError,
  onExport,
  composerDisabled = false,
  className = "",
  activityStatus = null,
}: ChatPanelProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const decisionByInterrupt = useMemo(() => {
    const map = new Map<string, Extract<TranscriptEntry, { kind: "decision" }>>();
    for (const e of entries) {
      if (e.kind === "decision") {
        map.set(e.interruptId, e);
      }
    }
    return map;
  }, [entries]);

  const currentKey = hitl.current ? envelopeKey(hitl.current) : null;

  const visible = useMemo(() => {
    const sorted = [...entries].sort((a, b) => {
      const byTime = a.at.localeCompare(b.at);
      if (byTime !== 0) return byTime;
      return a.id.localeCompare(b.id);
    });
    return sorted.length > 250 ? sorted.slice(-250) : sorted;
  }, [entries]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [visible, hitl.current, hitl.resuming, activityStatus]);

  return (
    <section
      className={["chat-panel", className].filter(Boolean).join(" ")}
      aria-label="Run chat"
    >
      <header className="chat-panel__head">
        <h2 className="chat-panel__title">Chat</h2>
        <div className="chat-panel__head-actions">
          {entries.length > 250 && (
            <span className="chat-panel__truncate">Showing last 250</span>
          )}
          <button type="button" className="btn-secondary" onClick={onExport}>
            Copy transcript
          </button>
        </div>
      </header>

      <div className="chat-panel__scroll" ref={scrollerRef}>
        {visible.length === 0 ? (
          <p className="chat-panel__empty">
            Run events, review cards, and mid-run instructions appear here.
          </p>
        ) : (
          visible.map((entry) => {
            if (entry.kind === "system") {
              return (
                <div key={entry.id} className="chat-bubble chat-bubble--system">
                  <span className="chat-bubble__meta">{formatTime(entry.at)}</span>
                  <p>{entry.text}</p>
                </div>
              );
            }
            if (entry.kind === "step") {
              return (
                <div key={entry.id} className="chat-bubble chat-bubble--step">
                  <span className="chat-bubble__meta">{formatTime(entry.at)}</span>
                  <p>
                    Step <code>{entry.node}</code>
                  </p>
                </div>
              );
            }
            if (entry.kind === "assistant") {
              return (
                <div key={entry.id} className="chat-bubble chat-bubble--assistant">
                  <span className="chat-bubble__meta">
                    {formatTime(entry.at)} · <code>{entry.node}</code>
                  </span>
                  <MarkdownView
                    source={entry.text}
                    className="markdown-view markdown-view--prose"
                  />
                </div>
              );
            }
            if (entry.kind === "instruction") {
              return (
                <div key={entry.id} className="chat-bubble chat-bubble--instruction">
                  <span className="chat-bubble__meta">{formatTime(entry.at)} · you</span>
                  <p>{entry.text}</p>
                </div>
              );
            }
            if (entry.kind === "error") {
              return (
                <div key={entry.id} className="chat-bubble chat-bubble--error">
                  <span className="chat-bubble__meta">{formatTime(entry.at)}</span>
                  <p>{entry.message}</p>
                </div>
              );
            }
            if (entry.kind === "decision") {
              const linked = entries.some(
                (e) =>
                  e.kind === "interrupt" &&
                  findDecision(decisionByInterrupt, e.envelope)?.id === entry.id
              );
              if (linked) return null;
              return <DecisionLine key={entry.id} entry={entry} />;
            }
            if (entry.kind === "interrupt") {
              const decided = findDecision(decisionByInterrupt, entry.envelope);
              if (decided) {
                return (
                  <ResolvedPause
                    key={entry.id}
                    envelope={entry.envelope}
                    decision={decided}
                    at={entry.at}
                  />
                );
              }
              const isCurrent =
                currentKey != null && envelopeKey(entry.envelope) === currentKey;
              if (isCurrent && hitl.current) {
                return (
                  <div key={entry.id} className="chat-interrupt">
                    <span className="chat-bubble__meta">
                      {formatTime(entry.at)} · review
                    </span>
                    <InterruptCard
                      envelope={hitl.current}
                      busy={
                        hitl.resuming ||
                        Boolean(
                          hitl.bulkApprovePlans &&
                            isPlanGate(hitl.current) &&
                            hitl.current.allowed_actions.includes("approve")
                        )
                      }
                      error={hitl.resumeError}
                      onResume={(request, envelope) => {
                        hitl.clearResumeError();
                        onResume(request, envelope);
                      }}
                    />
                    {hitl.stack.length > 1 && (
                      <p className="chat-interrupt__queue">
                        {hitl.stack.length} interrupts queued
                      </p>
                    )}
                    <label className="chat-bulk">
                      <input
                        type="checkbox"
                        checked={hitl.bulkApprovePlans}
                        disabled={hitl.resuming}
                        onChange={(e) => hitl.setBulkApprovePlans(e.target.checked)}
                      />
                      <span>Auto-approve remaining plan gates (skips future plan pauses)</span>
                    </label>
                  </div>
                );
              }
              return (
                <HistoricalPause
                  key={entry.id}
                  envelope={entry.envelope}
                  at={entry.at}
                />
              );
            }
            return null;
          })
        )}

        {/* Current interrupt not yet in transcript (e.g. mount hydrate). */}
        {hitl.current &&
          !entries.some(
            (e) =>
              e.kind === "interrupt" &&
              envelopeKey(e.envelope) === envelopeKey(hitl.current!)
          ) && (
            <div className="chat-interrupt">
              <InterruptCard
                envelope={hitl.current}
                busy={
                  hitl.resuming ||
                  Boolean(
                    hitl.bulkApprovePlans &&
                      isPlanGate(hitl.current) &&
                      hitl.current.allowed_actions.includes("approve")
                  )
                }
                error={hitl.resumeError}
                onResume={(request, envelope) => {
                  hitl.clearResumeError();
                  onResume(request, envelope);
                }}
              />
              <label className="chat-bulk">
                <input
                  type="checkbox"
                  checked={hitl.bulkApprovePlans}
                  disabled={hitl.resuming}
                  onChange={(e) => hitl.setBulkApprovePlans(e.target.checked)}
                />
                <span>Auto-approve remaining plan gates (skips future plan pauses)</span>
              </label>
            </div>
          )}

        {activityStatus && (
          <div className="chat-bubble chat-bubble--activity" role="status">
            <span className="chat-activity__pulse" aria-hidden />
            <p>{activityStatus}</p>
          </div>
        )}
      </div>

      <ChatComposer
        disabled={composerDisabled}
        sending={sendingInstruction}
        error={instructionError}
        onClearError={onClearInstructionError}
        onSend={onSendInstruction}
      />
    </section>
  );
}

export { resumeInterruptId };
