import type { CrossSectionReview, Finding } from "../../types/api";
import { formatJsonBlock } from "./artifactModel";

export type FindingsPanelProps = {
  findings: Finding[];
  crossReview: CrossSectionReview | null;
};

function ReviewList({
  title,
  items,
}: {
  title: string;
  items: unknown[] | undefined;
}) {
  if (!items?.length) return null;
  return (
    <section className="artifact-block">
      <h3 className="artifact-block__title">{title}</h3>
      <ul className="artifact-list">
        {items.map((item, i) => (
          <li key={i} className="artifact-list__item">
            <pre className="artifact-pre artifact-pre--inline">
              {formatJsonBlock(item)}
            </pre>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function FindingsPanel({ findings, crossReview }: FindingsPanelProps) {
  const hasReview =
    !!crossReview &&
    Boolean(
      crossReview.contradictions?.length ||
        crossReview.duplicate_findings?.length ||
        crossReview.cross_references?.length
    );

  if (findings.length === 0 && !hasReview) {
    return (
      <p className="artifact-empty">
        Cross-section findings appear after sections complete (`prior_findings`). The
        cross-section review block fills in after `cross_section_review` runs.
      </p>
    );
  }

  return (
    <div className="artifact-findings">
      {findings.length > 0 && (
        <section className="artifact-block">
          <h3 className="artifact-block__title">Prior findings</h3>
          <ul className="artifact-list">
            {findings.map((f) => (
              <li key={f.id || f.claim} className="artifact-list__item">
                <p className="artifact-list__lead">
                  <code>{f.id}</code> · {f.claim}
                </p>
                <p className="artifact-list__meta">
                  section <code>{f.section_id}</code>
                  {f.evidence_refs?.length
                    ? ` · refs ${f.evidence_refs.join(", ")}`
                    : null}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasReview && (
        <>
          <ReviewList title="Contradictions" items={crossReview?.contradictions} />
          <ReviewList title="Duplicate findings" items={crossReview?.duplicate_findings} />
          <ReviewList title="Cross-references" items={crossReview?.cross_references} />
        </>
      )}
    </div>
  );
}
