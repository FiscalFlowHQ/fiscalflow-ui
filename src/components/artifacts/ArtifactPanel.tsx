import { useMemo } from "react";
import type { UseArtifactStateResult } from "../../hooks/useArtifactState";
import EvidencePanel from "./EvidencePanel";
import ExportBar from "./ExportBar";
import FindingsPanel from "./FindingsPanel";
import LiveDraft from "./LiveDraft";
import MarkdownView from "./MarkdownView";
import SectionsView from "./SectionsView";

const TABS: Array<{ id: UseArtifactStateResult["tab"]; label: string }> = [
  { id: "live", label: "Live" },
  { id: "sections", label: "Sections" },
  { id: "evidence", label: "Evidence" },
  { id: "findings", label: "Findings" },
  { id: "report", label: "Report" },
];

export type ArtifactPanelProps = {
  artifacts: UseArtifactStateResult;
};

export default function ArtifactPanel({ artifacts }: ArtifactPanelProps) {
  const claimGroups = useMemo(() => {
    const groups = artifacts.completedSections.map((s) => ({
      sectionId: s.id,
      items: [...(s.claims ?? [])],
    }));
    const liveClaims = artifacts.sectionState?.claims;
    const liveId =
      (typeof artifacts.sectionState?.section_id === "string" &&
        artifacts.sectionState.section_id) ||
      artifacts.sectionState?.section?.id ||
      "in-progress";
    if (Array.isArray(liveClaims) && liveClaims.length) {
      const idx = groups.findIndex((g) => g.sectionId === liveId);
      if (idx >= 0) {
        groups[idx] = {
          ...groups[idx],
          items: [...groups[idx].items, ...liveClaims],
        };
      } else {
        groups.push({ sectionId: String(liveId), items: [...liveClaims] });
      }
    }
    return groups;
  }, [artifacts.completedSections, artifacts.sectionState]);

  const showExport =
    artifacts.runStatus === "completed" || artifacts.exportFormats.length > 0;

  return (
    <section className="artifact-panel" aria-label="Artifacts">
      <header className="artifact-panel__head">
        <h2 className="artifact-panel__title">Artifacts</h2>
        {artifacts.stateError && (
          <p className="artifact-panel__error" role="alert">
            {artifacts.stateError}
          </p>
        )}
      </header>

      <div className="artifact-tabs" role="tablist" aria-label="Artifact views">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={artifacts.tab === t.id}
            className={
              artifacts.tab === t.id
                ? "artifact-tabs__btn artifact-tabs__btn--active"
                : "artifact-tabs__btn"
            }
            onClick={() => artifacts.setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="artifact-panel__body" role="tabpanel">
        {artifacts.tab === "live" && (
          <LiveDraft
            text={artifacts.liveText}
            node={artifacts.liveNode}
            autoScroll={artifacts.autoScroll}
            onAutoScrollChange={artifacts.setAutoScroll}
          />
        )}
        {artifacts.tab === "sections" && (
          <SectionsView
            completed={artifacts.completedSections}
            sectionState={artifacts.sectionState}
          />
        )}
        {artifacts.tab === "evidence" && (
          <EvidencePanel
            sectionState={artifacts.sectionState}
            claims={claimGroups}
          />
        )}
        {artifacts.tab === "findings" && (
          <FindingsPanel
            findings={artifacts.priorFindings}
            crossReview={artifacts.crossReview}
          />
        )}
        {artifacts.tab === "report" && (
          <div className="artifact-report">
            {showExport && (
              <ExportBar
                formats={artifacts.exportFormats}
                busyFormat={artifacts.exportBusy}
                error={artifacts.exportError}
                awaitingArtifacts={
                  artifacts.runStatus === "completed" &&
                  artifacts.exportFormats.length === 0
                }
                onExport={(format) => {
                  artifacts.clearExportError();
                  void artifacts.downloadExport(format);
                }}
                onRefresh={() => {
                  void artifacts.refreshState().then(() => {
                    if (artifacts.runStatus === "completed") {
                      void artifacts.loadReport();
                    }
                  });
                }}
              />
            )}

            {artifacts.reportLoading && (
              <div className="skeleton-stack" aria-busy="true" aria-label="Loading report">
                <div className="skeleton skeleton--line" />
                <div className="skeleton skeleton--line" />
                <div className="skeleton skeleton--line skeleton--short" />
                <div className="skeleton skeleton--block" />
              </div>
            )}
            {!artifacts.reportLoading && artifacts.reportError && (
              <p className="artifact-empty" role="alert">
                {artifacts.reportError}
              </p>
            )}
            {!artifacts.reportLoading &&
              !artifacts.reportError &&
              artifacts.reportMarkdown && (
                <MarkdownView
                  source={artifacts.reportMarkdown}
                  className="markdown-view markdown-view--prose"
                />
              )}
            {!artifacts.reportLoading &&
              !artifacts.reportError &&
              !artifacts.reportMarkdown && (
                <p className="artifact-empty">
                  {artifacts.runStatus === "completed"
                    ? "Markdown preview unavailable — use Export above when the API lists a markdown artifact."
                    : "Assembled report appears here after the run completes. Export uses GET /sessions/…/document?format= — paths in metadata.artifacts are server filesystem locations, not content."}
                </p>
              )}
          </div>
        )}
      </div>
    </section>
  );
}
