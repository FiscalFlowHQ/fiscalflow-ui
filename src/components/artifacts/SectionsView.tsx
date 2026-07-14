import { useMemo, useState } from "react";
import type { CompletedSection, SectionState } from "../../types/api";
import {
  formatJsonBlock,
  liveSectionId,
  qualityLabel,
  sectionTitle,
} from "./artifactModel";
import MarkdownView from "./MarkdownView";

export type SectionsViewProps = {
  completed: CompletedSection[];
  sectionState: SectionState | null;
};

export default function SectionsView({ completed, sectionState }: SectionsViewProps) {
  const liveId = liveSectionId(sectionState);
  const liveDraft =
    typeof sectionState?.draft === "string" ? sectionState.draft : "";
  const liveNotes = sectionState?.review_notes;
  const liveVerdict = sectionState?.quality_verdict ?? null;

  const [open, setOpen] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => {
    let list: Array<{
      key: string;
      title: string;
      draft: string;
      live: boolean;
      verdict: string | null;
      reviewNotes: unknown[] | null;
    }> = completed.map((s) => ({
      key: s.id,
      title: sectionTitle(s),
      draft: s.draft ?? "",
      live: false,
      verdict: qualityLabel(s.quality_verdict),
      reviewNotes: null,
    }));

    if (liveId && !list.some((r) => r.key === liveId)) {
      list.push({
        key: liveId,
        title: liveId,
        draft: liveDraft,
        live: true,
        verdict: qualityLabel(liveVerdict),
        reviewNotes: Array.isArray(liveNotes) ? liveNotes : null,
      });
    } else if (liveId) {
      list = list.map((r) =>
        r.key === liveId
          ? {
              ...r,
              live: true,
              draft: liveDraft || r.draft,
              verdict: qualityLabel(liveVerdict) ?? r.verdict,
              reviewNotes: Array.isArray(liveNotes) ? liveNotes : r.reviewNotes,
            }
          : r
      );
    } else if (liveDraft && !list.length) {
      list.push({
        key: "in-progress",
        title: "In progress",
        draft: liveDraft,
        live: true,
        verdict: qualityLabel(liveVerdict),
        reviewNotes: Array.isArray(liveNotes) ? liveNotes : null,
      });
    }

    return list;
  }, [completed, liveId, liveDraft, liveNotes, liveVerdict]);

  if (rows.length === 0) {
    return (
      <p className="artifact-empty">
        No completed sections yet. Finished chapters land in `completed_sections`; the
        active chapter shows here from `section_state` when available.
      </p>
    );
  }

  return (
    <div className="artifact-sections">
      {rows.map((row) => {
        const expanded = open[row.key] ?? row.live;
        return (
          <details
            key={row.key}
            className="artifact-accordion"
            open={expanded}
            onToggle={(e) => {
              const el = e.currentTarget;
              setOpen((prev) => ({ ...prev, [row.key]: el.open }));
            }}
          >
            <summary className="artifact-accordion__summary">
              <span>{row.title}</span>
              <span className="artifact-accordion__badges">
                {row.live && <span className="artifact-pill artifact-pill--live">live</span>}
                {row.verdict && (
                  <span className="artifact-pill">{row.verdict}</span>
                )}
              </span>
            </summary>
            <div className="artifact-accordion__body">
              <MarkdownView
                source={row.draft}
                empty="_No draft yet._"
                className="markdown-view markdown-view--prose"
              />
              {row.reviewNotes && row.reviewNotes.length > 0 && (
                <div className="artifact-block">
                  <h4 className="artifact-block__title">Persona review notes</h4>
                  <pre className="artifact-pre">{formatJsonBlock(row.reviewNotes)}</pre>
                </div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
