/**
 * Rebuild pipeline rail progress from GET /state checkpoint fields.
 * Used after reconnect / Continue so the rail is not blank when SSE step
 * history was lost (orphaned stream, page refresh).
 */

import type { InterruptEnvelope } from "../../types/api";
import {
  INNER_STEP_SET,
  OPTIONAL_OUTER_GATES,
  OUTER_NODE_ORDER,
  createInitialPipelineState,
  refreshDisplayPhases,
  type PipelineState,
  type StepPhase,
  type StepStatus,
} from "./pipelineModel";

export type PipelineHydrateInput = {
  selectedSections: string[];
  currentSectionIndex?: number | null;
  stepTrace?: string[] | null;
  interrupt?: InterruptEnvelope | null;
  next?: string[] | null;
  runStatus?: string | null;
  completedSectionIds?: string[] | null;
};

function markOuterDoneThrough(
  outerNodes: Record<string, StepStatus>,
  lastDoneId: string,
  activeId?: string | null
): Record<string, StepStatus> {
  const lastIdx = OUTER_NODE_ORDER.indexOf(lastDoneId as (typeof OUTER_NODE_ORDER)[number]);
  const next = { ...outerNodes };
  for (let i = 0; i < OUTER_NODE_ORDER.length; i++) {
    const id = OUTER_NODE_ORDER[i];
    if (i < lastIdx) {
      if (OPTIONAL_OUTER_GATES.has(id) && next[id] === "pending") {
        next[id] = "skipped";
      } else if (next[id] === "pending") {
        next[id] = "done";
      }
    } else if (i === lastIdx) {
      next[id] = "done";
    }
  }
  if (activeId && OUTER_NODE_ORDER.includes(activeId as (typeof OUTER_NODE_ORDER)[number])) {
    for (const id of OUTER_NODE_ORDER) {
      if (next[id] === "active") next[id] = "done";
    }
    const activeIdx = OUTER_NODE_ORDER.indexOf(activeId as (typeof OUTER_NODE_ORDER)[number]);
    for (let i = 0; i < activeIdx; i++) {
      const id = OUTER_NODE_ORDER[i];
      if (OPTIONAL_OUTER_GATES.has(id) && next[id] === "pending") next[id] = "skipped";
      else if (next[id] === "pending") next[id] = "done";
    }
    next[activeId] = "active";
  }
  return next;
}

function interruptPhase(envelope: InterruptEnvelope): StepPhase {
  if (envelope.phase === "plan") return "plan";
  if (envelope.phase === "clarification") return "clarify";
  return "review";
}

/**
 * Pure hydrate: reconstruct a plausible rail from checkpoint + optional interrupt.
 */
export function hydratePipelineState(input: PipelineHydrateInput): PipelineState {
  const selected = input.selectedSections.filter(Boolean);
  let state = createInitialPipelineState(selected);
  if (selected.length === 0) return state;

  const completed = new Set(
    (input.completedSectionIds ?? []).filter((id): id is string => typeof id === "string")
  );
  const rawIdx =
    typeof input.currentSectionIndex === "number" && Number.isFinite(input.currentSectionIndex)
      ? input.currentSectionIndex
      : completed.size;
  const currentSectionIndex = Math.min(Math.max(rawIdx, 0), selected.length - 1);
  const next = Array.isArray(input.next) ? input.next : [];
  const interrupt = input.interrupt ?? null;
  const trace = (Array.isArray(input.stepTrace) ? input.stepTrace : []).filter(
    (id): id is string => typeof id === "string" && INNER_STEP_SET.has(id)
  );

  const nextHint = next[0] ?? null;
  const inInnerWork =
    trace.length > 0 ||
    (interrupt?.tier === "step" && !!interrupt.step_id) ||
    next.includes("run_section");

  let outerNodes = { ...state.outerNodes };

  if (
    input.runStatus === "completed" ||
    nextHint === "assemble_document" ||
    next.includes("assemble_document")
  ) {
    for (const id of OUTER_NODE_ORDER) {
      if (OPTIONAL_OUTER_GATES.has(id)) outerNodes[id] = "skipped";
      else outerNodes[id] = "done";
    }
  } else if (
    next.includes("compact_findings") ||
    next.includes("cross_section_review") ||
    nextHint === "compact_findings"
  ) {
    outerNodes = markOuterDoneThrough(outerNodes, "collect_section", nextHint);
  } else if (next.includes("collect_section") || nextHint === "collect_section") {
    outerNodes = markOuterDoneThrough(outerNodes, "run_section", "collect_section");
  } else if (next.includes("review_section") || nextHint === "review_section") {
    outerNodes = markOuterDoneThrough(outerNodes, "run_section", "review_section");
  } else if (inInnerWork || nextHint === "run_section") {
    outerNodes = markOuterDoneThrough(outerNodes, "approve_section", "run_section");
  } else if (
    interrupt?.tier === "section" ||
    next.includes("approve_section") ||
    next.includes("section_plan")
  ) {
    if (interrupt?.phase === "plan" || next.includes("approve_section")) {
      outerNodes = markOuterDoneThrough(outerNodes, "section_plan", "approve_section");
    } else {
      outerNodes = markOuterDoneThrough(outerNodes, "select_next_section", "section_plan");
    }
  } else if (interrupt?.tier === "global" || next.includes("approve_global") || next.includes("global_plan")) {
    if (interrupt?.phase === "plan" || next.includes("approve_global")) {
      outerNodes = markOuterDoneThrough(outerNodes, "global_plan", "approve_global");
    } else {
      outerNodes = markOuterDoneThrough(outerNodes, "audit_gate", "global_plan");
    }
  } else if (
    input.runStatus === "generating" ||
    input.runStatus === "awaiting_approval" ||
    input.runStatus === "planning" ||
    input.runStatus === "reviewing"
  ) {
    outerNodes = markOuterDoneThrough(outerNodes, "ingest", "global_plan");
  }

  const sections = state.sections.map((sec, i) => {
    if (completed.has(sec.sectionId) || i < currentSectionIndex) {
      return {
        ...sec,
        status: "done" as const,
        steps: sec.steps.map((s) => ({
          ...s,
          status: "done" as const,
          phase: null,
        })),
      };
    }
    if (i !== currentSectionIndex) return sec;

    let steps = sec.steps.map((s) => {
      const traceIdx = trace.indexOf(s.id);
      if (traceIdx >= 0) {
        return { ...s, status: "done" as const, phase: null };
      }
      return s;
    });

    if (interrupt?.tier === "step" && interrupt.step_id && INNER_STEP_SET.has(interrupt.step_id)) {
      const phase = interruptPhase(interrupt);
      steps = steps.map((s) => {
        if (s.id !== interrupt.step_id) {
          if (s.status === "active" || s.status === "regenerating") {
            return { ...s, status: "done" as const };
          }
          return s;
        }
        return {
          ...s,
          status: "active" as const,
          phase,
        };
      });
    } else if (inInnerWork && trace.length > 0) {
      // Mid-node after last traced step — keep run_section active, no inner active.
    }

    return {
      ...sec,
      status: "active" as const,
      steps,
    };
  });

  return refreshDisplayPhases({
    ...state,
    currentSectionIndex,
    selectNextCount: Math.max(currentSectionIndex + 1, 1),
    outerNodes,
    sections,
    awaitingReview: !!interrupt,
    complete: input.runStatus === "completed",
    failed: input.runStatus === "failed",
  });
}
