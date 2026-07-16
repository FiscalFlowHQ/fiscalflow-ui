import { useEffect, useRef } from "react";
import MarkdownView from "./MarkdownView";

export type LiveDraftProps = {
  text: string;
  node: string;
  autoScroll: boolean;
  onAutoScrollChange: (value: boolean) => void;
};

export default function LiveDraft({
  text,
  node,
  autoScroll,
  onAutoScrollChange,
}: LiveDraftProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [text, autoScroll]);

  return (
    <div className="artifact-live">
      <div className="artifact-live__toolbar">
        <p className="artifact-live__node">
          {node ? (
            <>
              Streaming <code>{node}</code>
            </>
          ) : (
            "Waiting for prose tokens…"
          )}
        </p>
        <label className="artifact-live__autoscroll">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => onAutoScrollChange(e.target.checked)}
          />
          Auto-scroll
        </label>
      </div>
      <div className="artifact-live__scroll" ref={scrollerRef}>
        {text.trim() ? (
          <MarkdownView source={text} className="markdown-view markdown-view--prose" />
        ) : (
          <p className="artifact-empty">
            Live draft appears here as the model streams prose steps (`draft` /
            `persona_review` / `polish`). After reconnect, this tab reseeds from
            `section_state.draft` when the BE exposes it.
          </p>
        )}
      </div>
    </div>
  );
}
