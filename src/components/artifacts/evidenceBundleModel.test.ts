import { describe, expect, it } from "vitest";
import {
  evidenceBundleHasReadableContent,
  normalizeEvidenceBundle,
} from "./evidenceBundleModel";

describe("normalizeEvidenceBundle", () => {
  it("maps topic keys with evidence / key_message / tables", () => {
    const normalized = normalizeEvidenceBundle({
      company_overview: {
        evidence: "Saudi private school operator.",
        key_message: "K-12 operator with 1,700 capacity.",
      },
      capacity_utilization: {
        evidence: "Utilization ~70%.",
        table_caption: "Capacity",
        table_data: [{ Metric: "Capacity", FY23: "1,700" }],
      },
    });

    expect(evidenceBundleHasReadableContent(normalized)).toBe(true);
    expect(normalized.topics).toHaveLength(2);
    expect(normalized.topics[0]?.title).toBe("Company Overview");
    expect(normalized.topics[0]?.keyMessage).toMatch(/K-12/);
    expect(normalized.topics[1]?.tableRows).toHaveLength(1);
  });

  it("keeps summary + citations shape", () => {
    const normalized = normalizeEvidenceBundle({
      summary: "Top-10 = 61%",
      citations: ["Sheet Rev!B12"],
    });
    expect(normalized.summary).toBe("Top-10 = 61%");
    expect(normalized.citations).toEqual(["Sheet Rev!B12"]);
  });
});
