import type { SessionStateResponse } from "../../../types/api";

/**
 * Captured-shape fixture for artifact views (mirrors BE `ReportState` / assembly tests).
 * Not a live `GET /state` recording — replace when a run capture is available.
 */
export const SAMPLE_SESSION_STATE: SessionStateResponse = {
  values: {
    databook_ref: "doc-sample",
    selected_sections: ["business_overview", "quality_of_earnings"],
    current_section_index: 1,
    run_status: "generating",
    completed_sections: [
      {
        id: "business_overview",
        title: "1. Business Overview",
        order: 1,
        draft: "### 1.1 Company profile\nThe Target is a B2B SaaS business.",
        claims: [
          {
            claim_text: "ARR grew 12% YoY.",
            evidence_refs: ["1.2.ARR"],
          },
        ],
        quality_verdict: { verdict: "pass" },
      },
    ],
    prior_findings: [
      {
        id: "f-arr",
        section_id: "business_overview",
        claim: "ARR grew 12% YoY.",
        evidence_refs: ["1.2.ARR"],
      },
    ],
    metadata: {
      cross_section_review: {
        contradictions: [
          { summary: "QoE margin note vs overview opex trajectory" },
        ],
        duplicate_findings: [],
        cross_references: [{ from: "quality_of_earnings", to: "business_overview" }],
      },
    },
    final_document: "/tmp/outputs/thread-x/report.pptx",
  },
  next: ["run_section"],
  interrupt: null,
  section_state: {
    section_id: "quality_of_earnings",
    section: { id: "quality_of_earnings", title: "3. Quality of Earnings", order: 3 },
    draft: "### 3.1 Revenue\nRevenue quality remains concentrated in top accounts.",
    evidence_bundle: {
      summary: "Top-10 customers = 61% of revenue",
      citations: ["Sheet Rev!B12"],
    },
    claims: [
      {
        claim_text: "Top-10 customers represent 61% of revenue.",
        evidence_refs: ["Sheet Rev!B12"],
      },
    ],
    structured_outline: { subsections: ["Revenue", "Adj. EBITDA"] },
    step_trace: ["gather_context", "distill_context", "build_outline", "draft"],
    quality_verdict: null,
    regen_count: 0,
    review_notes: [{ persona: "qa", note: "Cite concentration risk earlier." }],
  },
};
