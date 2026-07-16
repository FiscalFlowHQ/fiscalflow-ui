import { describe, expect, it } from "vitest";
import {
  FIXTURE_REGEN_LOOP,
  FIXTURE_START_TO_INTERRUPT,
} from "./fixtures/sseSteps.vocabulary";
import { createInitialPipelineState } from "./pipelineModel";
import { pipelineReducer } from "./pipelineReducer";

function applySteps(
  selected: string[],
  steps: { node: string; namespace: string[] }[]
) {
  let state = createInitialPipelineState(selected);
  for (const step of steps) {
    state = pipelineReducer(state, {
      type: "sse",
      event: { type: "step", node: step.node, namespace: step.namespace },
    });
  }
  return state;
}

describe("pipelineReducer", () => {
  it("maps outer ingest→plan and skips unseen optional gates", () => {
    const state = applySteps(["quality_of_earnings"], FIXTURE_START_TO_INTERRUPT);

    expect(state.outerNodes.ingest).toBe("done");
    expect(state.outerNodes.audit_gate).toBe("done");
    expect(state.outerNodes.global_plan).toBe("done");
    expect(state.outerNodes.approve_global).toBe("skipped");
    expect(state.outerNodes.run_section).toBe("active");

    const ingestPhase = state.displayPhases.find((p) => p.id === "ingest");
    expect(ingestPhase?.status).toBe("done");

    const qoe = state.sections[0];
    expect(qoe.sectionId).toBe("quality_of_earnings");
    expect(qoe.steps.find((s) => s.id === "gather_context")?.status).toBe("done");
    expect(qoe.steps.find((s) => s.id === "distill_context")?.status).toBe("active");
    expect(qoe.steps.find((s) => s.id === "distill_context")?.phase).toBe("review");
  });

  it("does not treat namespace UUID as the section id", () => {
    const state = applySteps(["business_overview"], FIXTURE_START_TO_INTERRUPT);
    expect(state.sections[0].sectionId).toBe("business_overview");
    expect(state.sections[0].sectionId).not.toContain("run_section");
  });

  it("marks awaiting review on interrupt", () => {
    let state = applySteps(["quality_of_earnings"], FIXTURE_START_TO_INTERRUPT);
    state = pipelineReducer(state, {
      type: "sse",
      event: {
        type: "interrupt",
        interruptId: "irq-1",
        envelope: {
          interrupt_id: "irq-1",
          tier: "step",
          phase: "review",
          section_id: "quality_of_earnings",
          step_id: "distill_context",
          content: {},
          allowed_actions: ["approve"],
        },
      },
    });
    expect(state.awaitingReview).toBe(true);
    expect(state.sections[0].steps.find((s) => s.id === "distill_context")?.status).toBe(
      "active"
    );
  });

  it("loop-aware: revisiting a done step resets that step and following ones", () => {
    const state = applySteps(["quality_of_earnings"], FIXTURE_REGEN_LOOP);
    const steps = state.sections[0].steps;
    const draft = steps.find((s) => s.id === "draft");
    const persona = steps.find((s) => s.id === "persona_review");
    const quality = steps.find((s) => s.id === "quality_gate");

    expect(draft?.status).toBe("regenerating");
    expect(draft?.phase).toBe("execute");
    expect(draft?.regenCount).toBe(1);
    expect(persona?.status).toBe("pending");
    expect(quality?.status).toBe("pending");
  });

  it("marks complete on done and failed on error", () => {
    let state = applySteps(["quality_of_earnings"], [
      { node: "ingest", namespace: [] },
      { node: "assemble_document", namespace: [] },
    ]);
    state = pipelineReducer(state, { type: "sse", event: { type: "done" } });
    expect(state.complete).toBe(true);
    expect(state.outerNodes.assemble_document).toBe("done");

    state = applySteps(["quality_of_earnings"], [{ node: "ingest", namespace: [] }]);
    state = pipelineReducer(state, {
      type: "sse",
      event: { type: "error", message: "boom" },
    });
    expect(state.failed).toBe(true);
    expect(state.outerNodes.ingest).toBe("failed");
  });

  it("records unknown node names without inventing aliases", () => {
    const state = applySteps(["quality_of_earnings"], [
      { node: "plan_report", namespace: [] },
    ]);
    expect(state.unknownNodes).toContain("plan_report");
  });
});
