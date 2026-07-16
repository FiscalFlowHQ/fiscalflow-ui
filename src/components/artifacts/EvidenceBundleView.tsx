import MarkdownView from "./MarkdownView";
import { formatJsonBlock } from "./artifactModel";
import {
  evidenceBundleHasReadableContent,
  normalizeEvidenceBundle,
  type EvidenceTopic,
} from "./evidenceBundleModel";

export type EvidenceBundleViewProps = {
  bundle: unknown;
  className?: string;
  /** Compact chrome for HITL card vs artifact panel. */
  compact?: boolean;
};

function TopicBlock({ topic }: { topic: EvidenceTopic }) {
  const columns =
    topic.tableRows.length > 0
      ? Array.from(
          topic.tableRows.reduce((set, row) => {
            Object.keys(row).forEach((k) => set.add(k));
            return set;
          }, new Set<string>())
        )
      : [];

  return (
    <article className="evidence-topic">
      <h4 className="evidence-topic__title">{topic.title}</h4>
      {topic.keyMessage && (
        <p className="evidence-topic__key">
          <strong>Key message.</strong> {topic.keyMessage}
        </p>
      )}
      {topic.evidence && (
        <MarkdownView
          source={topic.evidence}
          empty=""
          className="markdown-view evidence-topic__evidence"
        />
      )}
      {topic.tableRows.length > 0 && (
        <div className="evidence-topic__table-wrap">
          {topic.tableCaption && (
            <p className="evidence-topic__table-caption">{topic.tableCaption}</p>
          )}
          <table className="evidence-topic__table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topic.tableRows.map((row, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col}>{row[col] == null ? "" : String(row[col])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {Object.keys(topic.extra).length > 0 && (
        <details className="evidence-topic__extra">
          <summary>Additional fields</summary>
          <pre className="artifact-pre">{formatJsonBlock(topic.extra)}</pre>
        </details>
      )}
    </article>
  );
}

export default function EvidenceBundleView({
  bundle,
  className = "",
  compact = false,
}: EvidenceBundleViewProps) {
  const normalized = normalizeEvidenceBundle(bundle);

  if (!evidenceBundleHasReadableContent(normalized) && !normalized.residual) {
    return <p className="hitl-card__empty">No evidence in this bundle yet.</p>;
  }

  if (!evidenceBundleHasReadableContent(normalized) && normalized.residual) {
    return (
      <pre className={`artifact-pre ${className}`.trim()}>
        {formatJsonBlock(bundle)}
      </pre>
    );
  }

  return (
    <div
      className={`evidence-bundle ${compact ? "evidence-bundle--compact" : ""} ${className}`.trim()}
    >
      {normalized.summary && (
        <section className="evidence-bundle__summary">
          <h4 className="evidence-bundle__heading">Summary</h4>
          <MarkdownView
            source={normalized.summary}
            empty=""
            className="markdown-view"
          />
        </section>
      )}

      {normalized.topics.map((topic) => (
        <TopicBlock key={topic.id} topic={topic} />
      ))}

      {normalized.citations.length > 0 && (
        <section className="evidence-bundle__meta">
          <h4 className="evidence-bundle__heading">Citations</h4>
          <ul className="evidence-bundle__list">
            {normalized.citations.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      {normalized.dataGaps.length > 0 && (
        <section className="evidence-bundle__meta">
          <h4 className="evidence-bundle__heading">Data gaps</h4>
          <ul className="evidence-bundle__list">
            {normalized.dataGaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </section>
      )}

      {normalized.residual && (
        <details className="evidence-bundle__residual">
          <summary>Other fields (raw)</summary>
          <pre className="artifact-pre">{formatJsonBlock(normalized.residual)}</pre>
        </details>
      )}
    </div>
  );
}
