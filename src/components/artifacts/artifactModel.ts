import type {
  ClaimItem,
  CompletedSection,
  CrossSectionReview,
  Finding,
  QualityVerdict,
  SectionState,
} from "../../types/api";

export function claimText(claim: ClaimItem): string {
  if (typeof claim.claim_text === "string" && claim.claim_text) return claim.claim_text;
  if (typeof claim.claim === "string" && claim.claim) return claim.claim;
  try {
    return JSON.stringify(claim);
  } catch {
    return String(claim);
  }
}

export function claimRefs(claim: ClaimItem): string[] {
  return Array.isArray(claim.evidence_refs)
    ? claim.evidence_refs.map(String)
    : [];
}

export function qualityLabel(verdict: QualityVerdict | null | undefined): string | null {
  if (!verdict || typeof verdict !== "object") return null;
  const v = verdict.verdict ?? verdict.status;
  return typeof v === "string" && v ? v : null;
}

export function sectionTitle(section: CompletedSection): string {
  return section.title?.trim() || section.id;
}

export function liveSectionId(sectionState: SectionState | null | undefined): string | null {
  if (!sectionState) return null;
  if (typeof sectionState.section_id === "string" && sectionState.section_id) {
    return sectionState.section_id;
  }
  const nested = sectionState.section;
  if (nested && typeof nested === "object" && typeof nested.id === "string") {
    return nested.id;
  }
  return null;
}

export function normalizeCompletedSections(raw: unknown): CompletedSection[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      id: String(item.id ?? ""),
      title: typeof item.title === "string" ? item.title : undefined,
      order: typeof item.order === "number" ? item.order : null,
      draft: typeof item.draft === "string" ? item.draft : undefined,
      claims: Array.isArray(item.claims) ? (item.claims as ClaimItem[]) : undefined,
      quality_verdict:
        item.quality_verdict && typeof item.quality_verdict === "object"
          ? (item.quality_verdict as QualityVerdict)
          : null,
    }))
    .filter((s) => s.id)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

export function normalizeFindings(raw: unknown): Finding[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      id: String(item.id ?? ""),
      section_id: String(item.section_id ?? ""),
      claim: String(item.claim ?? item.claim_text ?? ""),
      evidence_refs: Array.isArray(item.evidence_refs)
        ? item.evidence_refs.map(String)
        : [],
    }))
    .filter((f) => f.id || f.claim);
}

export function normalizeSectionState(raw: unknown): SectionState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as SectionState;
}

export function normalizeCrossReview(raw: unknown): CrossSectionReview | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as CrossSectionReview;
}

export function formatJsonBlock(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
