/**
 * SSE step vocabulary fixture for pipeline reducer tests.
 *
 * Source of truth for node names: fiscalflow-api `app/graph/outer.py` (outer nodes),
 * `app/graph/registry.py` (`SECTION_STEP_ORDER`), and `make_step_cycle` suffixes
 * (`{id}.plan|approve|execute|clarify|review|join`).
 *
 * This is NOT a live `sse_client.py` capture (API was down at authoring time).
 * Handoff asks for a live recapture with a forced quality-gate fail to replace this
 * file — shapes below use only verified BE node ids (no invented outer phase names).
 */
export type FixtureStep = { node: string; namespace: string[] };

/** Happy-path outer ingest → plan → one section (partial inner) → interrupt. */
export const FIXTURE_START_TO_INTERRUPT: FixtureStep[] = [
  { node: "ingest", namespace: [] },
  { node: "audit_gate", namespace: [] },
  { node: "global_plan", namespace: [] },
  // balanced policy skips approve_global
  { node: "select_next_section", namespace: [] },
  { node: "section_plan", namespace: [] },
  // balanced skips approve_section
  { node: "run_section", namespace: [] },
  {
    node: "gather_context.execute",
    namespace: ["run_section:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"],
  },
  {
    node: "gather_context.join",
    namespace: ["run_section:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"],
  },
  {
    node: "distill_context.plan",
    namespace: ["run_section:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"],
  },
  {
    node: "distill_context.execute",
    namespace: ["run_section:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"],
  },
  {
    node: "distill_context.review",
    namespace: ["run_section:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"],
  },
];

/**
 * Regeneration loop: draft runs to review, then quality_gate fails and draft.plan
 * re-enters (MAX_REGEN path) — exercises loop-aware reset.
 */
export const FIXTURE_REGEN_LOOP: FixtureStep[] = [
  { node: "select_next_section", namespace: [] },
  { node: "run_section", namespace: [] },
  {
    node: "draft.plan",
    namespace: ["run_section:11111111-2222-3333-4444-555555555555"],
  },
  {
    node: "draft.execute",
    namespace: ["run_section:11111111-2222-3333-4444-555555555555"],
  },
  {
    node: "draft.review",
    namespace: ["run_section:11111111-2222-3333-4444-555555555555"],
  },
  {
    node: "draft.join",
    namespace: ["run_section:11111111-2222-3333-4444-555555555555"],
  },
  {
    node: "persona_review.execute",
    namespace: ["run_section:11111111-2222-3333-4444-555555555555"],
  },
  {
    node: "persona_review.join",
    namespace: ["run_section:11111111-2222-3333-4444-555555555555"],
  },
  {
    node: "quality_gate.execute",
    namespace: ["run_section:11111111-2222-3333-4444-555555555555"],
  },
  {
    node: "quality_gate.join",
    namespace: ["run_section:11111111-2222-3333-4444-555555555555"],
  },
  // Loop back — draft already done ⇒ regenerating
  {
    node: "draft.plan",
    namespace: ["run_section:11111111-2222-3333-4444-555555555555"],
  },
  {
    node: "draft.execute",
    namespace: ["run_section:11111111-2222-3333-4444-555555555555"],
  },
];
