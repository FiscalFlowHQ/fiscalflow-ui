import type { SseEvent } from "../../types/sse";
import {
  OPTIONAL_OUTER_GATES,
  OUTER_NODE_ORDER,
  OUTER_NODE_SET,
  createInitialPipelineState,
  parseInnerNode,
  refreshDisplayPhases,
  type OuterNodeId,
  type PipelineState,
  type PipelineStep,
  type StepPhase,
  type StepStatus,
} from "./pipelineModel";

export type PipelineAction =
  | { type: "reset"; selectedSections: string[] }
  | { type: "sse"; event: SseEvent }
  | { type: "status_hint"; awaitingApproval: boolean };

function markPreviousActiveDone(steps: PipelineStep[], exceptId: string): PipelineStep[] {
  return steps.map((s) =>
    s.id !== exceptId && (s.status === "active" || s.status === "regenerating")
      ? { ...s, status: "done" as const, phase: s.phase }
      : s
  );
}

function applyRegen(steps: PipelineStep[], fromIdx: number, phase: StepPhase): PipelineStep[] {
  return steps.map((s, i) => {
    if (i < fromIdx) {
      if (s.status === "active" || s.status === "regenerating") {
        return { ...s, status: "done" as const };
      }
      return s;
    }
    if (i === fromIdx) {
      return {
        ...s,
        status: "regenerating" as const,
        phase,
        regenCount: s.regenCount + 1,
      };
    }
    return {
      ...s,
      status: "pending" as const,
      phase: null,
    };
  });
}

function activateInner(
  steps: PipelineStep[],
  stepId: string,
  phase: StepPhase
): PipelineStep[] {
  const idx = steps.findIndex((s) => s.id === stepId);
  if (idx < 0) return steps;

  const existing = steps[idx];
  if (existing.status === "done" || existing.status === "skipped") {
    return applyRegen(steps, idx, phase);
  }

  let next = markPreviousActiveDone(steps, stepId);
  const stayRegen = existing.status === "regenerating";
  next = next.map((s, i) => {
    if (i !== idx) return s;
    return {
      ...s,
      status: stayRegen ? ("regenerating" as const) : ("active" as const),
      phase,
    };
  });
  return next;
}

function skipPendingOptionalGates(
  outerNodes: Record<string, StepStatus>,
  activatedNode: string
): Record<string, StepStatus> {
  const activatedIdx = OUTER_NODE_ORDER.indexOf(activatedNode as OuterNodeId);
  if (activatedIdx < 0) return outerNodes;
  const next = { ...outerNodes };
  for (let i = 0; i < activatedIdx; i++) {
    const id = OUTER_NODE_ORDER[i];
    if (OPTIONAL_OUTER_GATES.has(id) && next[id] === "pending") {
      next[id] = "skipped";
    }
  }
  return next;
}

function setOuterActive(state: PipelineState, node: string): PipelineState {
  let outerNodes = { ...state.outerNodes };
  // Prior active outer → done
  for (const id of OUTER_NODE_ORDER) {
    if (outerNodes[id] === "active") outerNodes[id] = "done";
  }
  outerNodes = skipPendingOptionalGates(outerNodes, node);
  outerNodes[node] = "active";
  return refreshDisplayPhases({ ...state, outerNodes, awaitingReview: false });
}

function applyOuterStep(state: PipelineState, node: string): PipelineState {
  if (!OUTER_NODE_SET.has(node)) {
    return {
      ...state,
      unknownNodes: state.unknownNodes.includes(node)
        ? state.unknownNodes
        : [...state.unknownNodes, node],
    };
  }

  let next = setOuterActive(state, node);

  if (node === "select_next_section") {
    const selectNextCount = next.selectNextCount + 1;
    let currentSectionIndex = next.currentSectionIndex;
    if (selectNextCount > 1) {
      currentSectionIndex = Math.min(
        currentSectionIndex + 1,
        Math.max(next.selectedSections.length - 1, 0)
      );
    }
    const sections = next.sections.map((sec, i) => {
      if (i === currentSectionIndex) {
        return {
          ...sec,
          status: "active" as const,
          steps: sec.steps.map((s) => ({
            ...s,
            status: "pending" as const,
            phase: null,
            // keep regenCount across section re-entry only if same section regen — reset here
            regenCount: selectNextCount > 1 ? 0 : s.regenCount,
          })),
        };
      }
      if (i < currentSectionIndex && sec.status !== "done") {
        return { ...sec, status: "done" as const };
      }
      return sec;
    });
    next = { ...next, selectNextCount, currentSectionIndex, sections };
  }

  if (node === "collect_section") {
    const sections = next.sections.map((sec, i) => {
      if (i !== next.currentSectionIndex) return sec;
      return {
        ...sec,
        status: "done" as const,
        steps: sec.steps.map((s) =>
          s.status === "pending" || s.status === "skipped"
            ? s
            : { ...s, status: "done" as const }
        ),
      };
    });
    next = { ...next, sections };
  }

  if (node === "run_section") {
    const sections = next.sections.map((sec, i) =>
      i === next.currentSectionIndex ? { ...sec, status: "active" as const } : sec
    );
    next = { ...next, sections };
  }

  return refreshDisplayPhases(next);
}

function applyInnerStep(state: PipelineState, node: string): PipelineState | null {
  const parsed = parseInnerNode(node);
  if (!parsed) return null;

  const { stepId, phase } = parsed;
  const idx = state.currentSectionIndex;
  if (idx < 0 || idx >= state.sections.length) {
    // No section cursor yet — still record unknown-ish progress on first section if any
    if (state.sections.length === 0) {
      return {
        ...state,
        unknownNodes: state.unknownNodes.includes(node)
          ? state.unknownNodes
          : [...state.unknownNodes, node],
      };
    }
  }

  const sectionIndex = Math.min(Math.max(idx, 0), state.sections.length - 1);
  const sections = state.sections.map((sec, i) => {
    if (i !== sectionIndex) return sec;
    const steps = activateInner(sec.steps, stepId, phase);
    return { ...sec, status: "active" as const, steps };
  });

  // Ensure run_section looks active while inner work proceeds.
  let outerNodes = { ...state.outerNodes };
  if (outerNodes.run_section === "pending") {
    outerNodes = skipPendingOptionalGates(outerNodes, "run_section");
  }
  for (const id of OUTER_NODE_ORDER) {
    if (id !== "run_section" && outerNodes[id] === "active") outerNodes[id] = "done";
  }
  outerNodes.run_section = "active";

  return refreshDisplayPhases({
    ...state,
    sections,
    outerNodes,
    awaitingReview: false,
  });
}

function applyStepEvent(state: PipelineState, node: string): PipelineState {
  const inner = applyInnerStep(state, node);
  if (inner) return inner;
  return applyOuterStep(state, node);
}

function markAllDone(state: PipelineState): PipelineState {
  const outerNodes: Record<string, StepStatus> = { ...state.outerNodes };
  for (const id of OUTER_NODE_ORDER) {
    if (outerNodes[id] === "pending" && OPTIONAL_OUTER_GATES.has(id)) {
      outerNodes[id] = "skipped";
    } else if (outerNodes[id] !== "skipped") {
      outerNodes[id] = "done";
    }
  }
  const sections = state.sections.map((sec) => ({
    ...sec,
    status: "done" as const,
    steps: sec.steps.map((s) => ({
      ...s,
      status:
        s.status === "pending" ? ("skipped" as const) : ("done" as const),
    })),
  }));
  return refreshDisplayPhases({
    ...state,
    outerNodes,
    sections,
    awaitingReview: false,
    complete: true,
    failed: false,
  });
}

function markFailed(state: PipelineState): PipelineState {
  const outerNodes = { ...state.outerNodes };
  for (const id of OUTER_NODE_ORDER) {
    if (outerNodes[id] === "active") outerNodes[id] = "failed";
  }
  const sections = state.sections.map((sec) => ({
    ...sec,
    status: sec.status === "active" ? ("failed" as const) : sec.status,
    steps: sec.steps.map((s) =>
      s.status === "active" || s.status === "regenerating"
        ? { ...s, status: "failed" as const }
        : s
    ),
  }));
  return refreshDisplayPhases({
    ...state,
    outerNodes,
    sections,
    awaitingReview: false,
    failed: true,
  });
}

export function pipelineReducer(
  state: PipelineState,
  action: PipelineAction
): PipelineState {
  switch (action.type) {
    case "reset":
      return createInitialPipelineState(action.selectedSections);
    case "status_hint":
      return { ...state, awaitingReview: action.awaitingApproval || state.awaitingReview };
    case "sse": {
      const ev = action.event;
      if (ev.type === "step") {
        return applyStepEvent(state, ev.node);
      }
      if (ev.type === "interrupt") {
        return { ...state, awaitingReview: true };
      }
      if (ev.type === "done") {
        return markAllDone(state);
      }
      if (ev.type === "error") {
        return markFailed(state);
      }
      return state;
    }
    default:
      return state;
  }
}
