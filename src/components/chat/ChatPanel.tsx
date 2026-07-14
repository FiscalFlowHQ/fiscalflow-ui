import { useEffect, useMemo, useRef } from "react";
import InterruptCard from "../hitl/InterruptCard";
import { envelopeKey, resumeInterruptId } from "../hitl/hitlContent";
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
}: ChatPanelProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const decisionByInterrupt = useMemo(() => {
    const map = new Map<string, Extract<TranscriptEntry, { kind: "decision" }>>();
    for (const e of entries) {
      if (e.kind === "decision") map.set(e.interruptId, e);
    }
    return map;
  }, [entries]);

  const currentKey = hitl.current ? envelopeKey(hitl.current) : null;

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries, hitl.current, hitl.resuming]);

  // Soft virtualization: only render last 250 entries (task notes optional react-window).
  const visible = entries.length > 250 ? entries.slice(-250) : entries;

  return (
    <section className="chat-panel" aria-label="Run chat">
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
                  (e.envelope.interrupt_id || envelopeKey(e.envelope)) ===
                    entry.interruptId
              );
              if (linked) return null;
              return <DecisionLine key={entry.id} entry={entry} />;
            }
            if (entry.kind === "interrupt") {
              const id =
                entry.envelope.interrupt_id || envelopeKey(entry.envelope);
              const decided = decisionByInterrupt.get(id);
              if (decided) {
                return <DecisionLine key={entry.id} entry={decided} />;
              }
              const isCurrent =
                currentKey != null && envelopeKey(entry.envelope) === currentKey;
              if (isCurrent && hitl.current) {
                return (
                  <div key={entry.id} className="chat-interrupt">
                    <span className="chat-bubble__meta">{formatTime(entry.at)} · review</span>
                    <InterruptCard
                      envelope={hitl.current}
                      busy={hitl.resuming}
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
                      <span>Auto-approve remaining plan gates</span>
                    </label>
                  </div>
                );
              }
              return (
                <div key={entry.id} className="chat-bubble chat-bubble--system">
                  <span className="chat-bubble__meta">{formatTime(entry.at)}</span>
                  <p>
                    Pause queued ({entry.envelope.phase} · {entry.envelope.tier})
                    {entry.envelope.section_id
                      ? ` · ${entry.envelope.section_id}`
                      : ""}
                  </p>
                </div>
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
                busy={hitl.resuming}
                error={hitl.resumeError}
                onResume={(request, envelope) => {
                  hitl.clearResumeError();
                  onResume(request, envelope);
                }}
              />
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
