import { describe, expect, it } from "vitest";
import { hydratePipelineState } from "./pipelineHydrate";

describe("hydratePipelineState", () => {
  it("rebuilds section inner progress from step_trace at run_section", () => {
    const state = hydratePipelineState({
      selectedSections: ["business_overview", "quality_of_earnings"],
      currentSectionIndex: 0,
      stepTrace: ["gather_context", "distill_context"],
      next: ["run_section"],
      runStatus: "generating",
      interrupt: null,
    });

    expect(state.outerNodes.run_section).toBe("active");
    expect(state.outerNodes.ingest).toBe("done");
    expect(state.sections[0]?.status).toBe("active");
    expect(state.sections[0]?.steps.find((s) => s.id === "gather_context")?.status).toBe(
      "done"
    );
    expect(state.sections[0]?.steps.find((s) => s.id === "distill_context")?.status).toBe(
      "done"
    );
    expect(state.sections[0]?.steps.find((s) => s.id === "build_outline")?.status).toBe(
      "pending"
    );
  });

  it("activates interrupt step phase for distill review", () => {
    const state = hydratePipelineState({
      selectedSections: ["business_overview"],
      currentSectionIndex: 0,
      stepTrace: ["gather_context", "distill_context"],
      next: [],
      runStatus: "awaiting_approval",
      interrupt: {
        interrupt_id: "irq-1",
        tier: "step",
        phase: "review",
        section_id: "business_overview",
        step_id: "distill_context",
        content: {},
        allowed_actions: ["approve"],
      },
    });

    const distill = state.sections[0]?.steps.find((s) => s.id === "distill_context");
    expect(distill?.status).toBe("active");
    expect(distill?.phase).toBe("review");
    expect(state.awaitingReview).toBe(true);
  });
});
