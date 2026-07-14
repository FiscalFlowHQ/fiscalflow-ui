import type { ClaimItem, SectionState } from "../../types/api";
import {
  claimRefs,
  claimText,
  formatJsonBlock,
  liveSectionId,
} from "./artifactModel";

export type EvidencePanelProps = {
  sectionState: SectionState | null;
  /** Claims from completed sections + in-progress. */
  claims: { sectionId: string; items: ClaimItem[] }[];
};

export default function EvidencePanel({ sectionState, claims }: EvidencePanelProps) {
  const bundle = sectionState?.evidence_bundle ?? null;
  const liveId = liveSectionId(sectionState);
  const hasClaims = claims.some((c) => c.items.length > 0);

  if (!bundle && !hasClaims) {
    return (
      <p className="artifact-empty">
        No evidence bundle or claims yet. Distill / synthesize steps populate these mid-run
        once `section_state` (or completed section claims) is available.
      </p>
    );
  }

  return (
    <div className="artifact-evidence">
      {bundle && (
        <section className="artifact-block">
          <h3 className="artifact-block__title">
            Evidence bundle
            {liveId ? (
              <span className="artifact-pill artifact-pill--live">{liveId}</span>
            ) : null}
          </h3>
          <pre className="artifact-pre">{formatJsonBlock(bundle)}</pre>
        </section>
      )}

      {claims.map((group) =>
        group.items.length === 0 ? null : (
          <section key={group.sectionId} className="artifact-block">
            <h3 className="artifact-block__title">
              Claims <code>{group.sectionId}</code>
            </h3>
            <ul className="artifact-list">
              {group.items.map((item, i) => {
                const refs = claimRefs(item);
                return (
                  <li key={`${group.sectionId}-${i}`} className="artifact-list__item">
                    <p className="artifact-list__lead">{claimText(item)}</p>
                    {refs.length > 0 && (
                      <p className="artifact-list__meta">
                        refs: {refs.map((r) => (
                          <code key={r}>{r}</code>
                        ))}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )
      )}
    </div>
  );
}
