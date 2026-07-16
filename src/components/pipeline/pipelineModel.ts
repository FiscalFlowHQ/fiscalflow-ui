/**
 * Pipeline rail model — outer/inner node vocabulary verified against
 * `fiscalflow-api` `outer.py` + `registry.SECTION_STEP_ORDER` + `make_step_cycle`.
 */

export type StepStatus =
  | "pending"
  | "active"
  | "done"
  | "skipped"
  | "regenerating"
  | "failed";

export type StepPhase = "plan" | "approve" | "execute" | "clarify" | "review" | "join" | null;

export type PipelineStep = {
  id: string;
  label: string;
  status: StepStatus;
  phase: StepPhase;
  sectionId: string | null;
  regenCount: number;
};

export type DisplayPhaseId = "ingest" | "plan" | "section_loop" | "review_assemble";

export type DisplayPhase = {
  id: DisplayPhaseId;
  label: string;
  /** Outer BE node ids in this phase (canonical order). */
  nodeIds: string[];
  status: StepStatus;
};

export type SectionRail = {
  sectionId: string;
  label: string;
  status: StepStatus;
  steps: PipelineStep[];
};

export type PipelineState = {
  selectedSections: string[];
  currentSectionIndex: number;
  /** How many times we've seen `select_next_section` this run. */
  selectNextCount: number;
  displayPhases: DisplayPhase[];
  /** Per-outer-node progress (for skip detection / phase aggregation). */
  outerNodes: Record<string, StepStatus>;
  sections: SectionRail[];
  awaitingReview: boolean;
  complete: boolean;
  failed: boolean;
  /** BE nodes we couldn't map — log in Handoff / debug. */
  unknownNodes: string[];
};

/** Outer graph nodes in visit order (`build_outer_graph`). */
export const OUTER_NODE_ORDER = [
  "ingest",
  "audit_gate",
  "global_plan",
  "approve_global",
  "select_next_section",
  "section_plan",
  "approve_section",
  "run_section",
  "review_section",
  "collect_section",
  "compact_findings",
  "cross_section_review",
  "assemble_document",
] as const;

export type OuterNodeId = (typeof OUTER_NODE_ORDER)[number];

/** Optional HITL gates often skipped under `balanced` policy. */
export const OPTIONAL_OUTER_GATES = new Set<string>([
  "approve_global",
  "approve_section",
  "review_section",
]);

export const DISPLAY_PHASE_DEFS: Omit<DisplayPhase, "status">[] = [
  {
    id: "ingest",
    label: "Ingest",
    nodeIds: ["ingest", "audit_gate"],
  },
  {
    id: "plan",
    label: "Plan",
    nodeIds: ["global_plan", "approve_global"],
  },
  {
    id: "section_loop",
    label: "Sections",
    nodeIds: [
      "select_next_section",
      "section_plan",
      "approve_section",
      "run_section",
      "review_section",
      "collect_section",
    ],
  },
  {
    id: "review_assemble",
    label: "Review & assemble",
    nodeIds: ["compact_findings", "cross_section_review", "assemble_document"],
  },
];

/** Inner section step chain (`SECTION_STEP_ORDER`). */
export const INNER_STEP_ORDER = [
  "gather_context",
  "distill_context",
  "build_outline",
  "draft",
  "persona_review",
  "polish",
  "synthesize_claims",
  "quality_gate",
  "human_review",
] as const;

export type InnerStepId = (typeof INNER_STEP_ORDER)[number];

export const INNER_STEP_SET = new Set<string>(INNER_STEP_ORDER);

export const OUTER_NODE_SET = new Set<string>(OUTER_NODE_ORDER);

export const OUTER_LABELS: Record<string, string> = {
  ingest: "Ingesting databook",
  audit_gate: "Audit gate",
  global_plan: "Global plan",
  approve_global: "Approve global plan",
  select_next_section: "Select next section",
  section_plan: "Section plan",
  approve_section: "Approve section plan",
  run_section: "Run section steps",
  review_section: "Review section",
  collect_section: "Collect section",
  compact_findings: "Compact findings",
  cross_section_review: "Cross-section review",
  assemble_document: "Assemble document",
};

export const INNER_LABELS: Record<string, string> = {
  gather_context: "Gather context",
  distill_context: "Distill evidence",
  build_outline: "Build outline",
  draft: "Draft",
  persona_review: "Persona review",
  polish: "Polish",
  synthesize_claims: "Synthesize claims",
  quality_gate: "Quality gate",
  human_review: "Human review",
};

const PHASE_VERBS: Record<string, string> = {
  plan: "Planning",
  approve: "Awaiting approval for",
  execute: "Running",
  clarify: "Clarifying",
  review: "Reviewing",
  join: "Finishing",
};

export function innerStepDetailLabel(stepId: string, phase: StepPhase): string {
  const base = INNER_LABELS[stepId] ?? stepId;
  if (!phase || phase === "join") return base;
  if (phase === "approve") return `Awaiting approval — ${base.toLowerCase()}`;
  if (phase === "plan") return `Planning — ${base.toLowerCase()}`;
  if (phase === "execute") return `${PHASE_VERBS.execute} — ${base.toLowerCase()}`;
  if (phase === "clarify") return `Clarifying — ${base.toLowerCase()}`;
  if (phase === "review") return `Review — ${base.toLowerCase()}`;
  return base;
}

export function parseInnerNode(
  node: string
): { stepId: string; phase: StepPhase } | null {
  const lastDot = node.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const stepId = node.slice(0, lastDot);
  const suffix = node.slice(lastDot + 1);
  if (!INNER_STEP_SET.has(stepId)) return null;
  const phases: StepPhase[] = ["plan", "approve", "execute", "clarify", "review", "join"];
  if (!phases.includes(suffix as StepPhase)) return null;
  return { stepId, phase: suffix as StepPhase };
}

function freshInnerSteps(sectionId: string): PipelineStep[] {
  return INNER_STEP_ORDER.map((id) => ({
    id,
    label: INNER_LABELS[id] ?? id,
    status: "pending" as const,
    phase: null,
    sectionId,
    regenCount: 0,
  }));
}

export function createInitialPipelineState(
  selectedSections: string[] = []
): PipelineState {
  const sections = selectedSections.map((sectionId) => ({
    sectionId,
    label: sectionId,
    status: "pending" as const,
    steps: freshInnerSteps(sectionId),
  }));

  const outerNodes: Record<string, StepStatus> = {};
  for (const id of OUTER_NODE_ORDER) outerNodes[id] = "pending";

  return {
    selectedSections,
    currentSectionIndex: 0,
    selectNextCount: 0,
    displayPhases: DISPLAY_PHASE_DEFS.map((d) => ({ ...d, status: "pending" })),
    outerNodes,
    sections,
    awaitingReview: false,
    complete: false,
    failed: false,
    unknownNodes: [],
  };
}

export function aggregatePhaseStatus(
  nodeIds: string[],
  outerNodes: Record<string, StepStatus>
): StepStatus {
  const statuses = nodeIds.map((id) => outerNodes[id] ?? "pending");
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.some((s) => s === "active" || s === "regenerating")) return "active";
  if (statuses.every((s) => s === "done" || s === "skipped")) {
    return statuses.some((s) => s === "done") ? "done" : "pending";
  }
  if (statuses.some((s) => s === "done" || s === "skipped")) return "active";
  return "pending";
}

export function refreshDisplayPhases(state: PipelineState): PipelineState {
  return {
    ...state,
    displayPhases: state.displayPhases.map((phase) => ({
      ...phase,
      status: aggregatePhaseStatus(phase.nodeIds, state.outerNodes),
    })),
  };
}
