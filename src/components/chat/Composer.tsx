import { useState } from "react";

export type ChatComposerProps = {
  disabled?: boolean;
  sending?: boolean;
  error?: string | null;
  onSend: (text: string) => Promise<void> | void;
  onClearError?: () => void;
};

/** Mid-run instruction composer → POST /sessions/{id}/instruction. */
export default function ChatComposer({
  disabled = false,
  sending = false,
  error = null,
  onSend,
  onClearError,
}: ChatComposerProps) {
  const [text, setText] = useState("");

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled || sending) return;
    onClearError?.();
    await onSend(trimmed);
    setText("");
  }

  return (
    <div className="chat-composer">
      <p className="chat-composer__hint">
        Applies from the <strong>next</strong> planning step (current section will not see
        it). Guidance only — review decisions stay on the interrupt cards.
      </p>
      <textarea
        className="chat-composer__input"
        rows={3}
        value={text}
        disabled={disabled || sending}
        placeholder="e.g. Focus on churn and use conservative adjustments…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      {error && (
        <p className="chat-composer__error" role="alert">
          {error}
        </p>
      )}
      <div className="chat-composer__actions">
        <button
          type="button"
          className="btn-primary"
          disabled={disabled || sending || !text.trim()}
          onClick={() => void submit()}
        >
          {sending ? "Sending…" : "Send instruction"}
        </button>
      </div>
    </div>
  );
}
