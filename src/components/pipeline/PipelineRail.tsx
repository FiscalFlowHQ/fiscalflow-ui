import {
  INNER_LABELS,
  OUTER_LABELS,
  innerStepDetailLabel,
  type DisplayPhase,
  type PipelineState,
  type PipelineStep,
  type SectionRail,
  type StepStatus,
} from "./pipelineModel";

function statusGlyph(status: StepStatus): string {
  switch (status) {
    case "done":
      return "✓";
    case "active":
    case "regenerating":
      return "◐";
    case "failed":
      return "✗";
    case "skipped":
      return "–";
    default:
      return "○";
  }
}

function PhaseBlock({ phase }: { phase: DisplayPhase }) {
  return (
    <div className={`pipeline-phase pipeline-phase--${phase.status}`}>
      <div className="pipeline-phase__head">
        <span className="pipeline-phase__glyph" aria-hidden>
          {statusGlyph(phase.status)}
        </span>
        <span className="pipeline-phase__label">{phase.label}</span>
      </div>
      <ul className="pipeline-phase__nodes">
        {phase.nodeIds.map((nodeId) => (
          <li key={nodeId} className="pipeline-node-hint">
            {OUTER_LABELS[nodeId] ?? nodeId}
          </li>
        ))}
      </ul>
    </div>
  );
}

function InnerStepRow({ step }: { step: PipelineStep }) {
  const detail = innerStepDetailLabel(step.id, step.phase);
  return (
    <li
      className={`pipeline-step pipeline-step--${step.status}`}
      aria-current={
        step.status === "active" || step.status === "regenerating" ? "step" : undefined
      }
    >
      <span className="pipeline-step__glyph" aria-hidden>
        {statusGlyph(step.status)}
      </span>
      <span className="pipeline-step__body">
        <span className="pipeline-step__label">
          {INNER_LABELS[step.id] ?? step.label}
        </span>
        {(step.status === "active" || step.status === "regenerating") && step.phase && (
          <span className="pipeline-step__detail">{detail}</span>
        )}
        {step.regenCount > 0 && (
          <span className="pipeline-step__regen">regen ×{step.regenCount}</span>
        )}
      </span>
    </li>
  );
}

function SectionBlock({
  section,
  expanded,
}: {
  section: SectionRail;
  expanded: boolean;
}) {
  return (
    <div className={`pipeline-section pipeline-section--${section.status}`}>
      <div className="pipeline-section__head">
        <span className="pipeline-section__glyph" aria-hidden>
          {statusGlyph(section.status)}
        </span>
        <span className="pipeline-section__title">{section.label}</span>
      </div>
      {expanded && (
        <ol className="pipeline-section__steps">
          {section.steps.map((step) => (
            <InnerStepRow key={step.id} step={step} />
          ))}
        </ol>
      )}
    </div>
  );
}

export type PipelineRailProps = {
  state: PipelineState;
  /** Collapse inactive sections when multiple are selected. */
  collapseInactiveSections?: boolean;
};

export default function PipelineRail({
  state,
  collapseInactiveSections = true,
}: PipelineRailProps) {
  const multi = state.sections.length > 1;

  return (
    <nav className="pipeline-rail" aria-label="Pipeline progress">
      <header className="pipeline-rail__head">
        <h2 className="pipeline-rail__title">Pipeline</h2>
        {state.awaitingReview && (
          <span className="status-chip status-chip--awaiting_review">Awaiting review</span>
        )}
        {state.complete && (
          <span className="status-chip status-chip--complete">Complete</span>
        )}
        {state.failed && <span className="status-chip status-chip--failed">Failed</span>}
      </header>

      <div className="pipeline-rail__scroll">
        {state.displayPhases
          .filter((p) => p.id !== "section_loop")
          .slice(0, 2)
          .map((phase) => (
            <PhaseBlock key={phase.id} phase={phase} />
          ))}

        <div
          className={`pipeline-phase pipeline-phase--${
            state.displayPhases.find((p) => p.id === "section_loop")?.status ?? "pending"
          }`}
        >
          <div className="pipeline-phase__head">
            <span className="pipeline-phase__glyph" aria-hidden>
              {statusGlyph(
                state.displayPhases.find((p) => p.id === "section_loop")?.status ??
                  "pending"
              )}
            </span>
            <span className="pipeline-phase__label">
              Sections
              {state.sections.length > 0
                ? ` (${Math.min(state.currentSectionIndex + 1, state.sections.length)}/${state.sections.length})`
                : ""}
            </span>
          </div>

          {state.sections.length === 0 ? (
            <p className="pipeline-rail__empty">Sections appear after Start.</p>
          ) : (
            state.sections.map((section, i) => {
              const expanded =
                !collapseInactiveSections ||
                !multi ||
                i === state.currentSectionIndex ||
                section.status === "active" ||
                section.status === "failed";
              return (
                <SectionBlock key={section.sectionId} section={section} expanded={expanded} />
              );
            })
          )}
        </div>

        {state.displayPhases
          .filter((p) => p.id === "review_assemble")
          .map((phase) => (
            <PhaseBlock key={phase.id} phase={phase} />
          ))}
      </div>

      {state.unknownNodes.length > 0 && (
        <details className="pipeline-rail__unknown">
          <summary>Unmapped nodes ({state.unknownNodes.length})</summary>
          <ul>
            {state.unknownNodes.map((n) => (
              <li key={n}>
                <code>{n}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
    </nav>
  );
}
