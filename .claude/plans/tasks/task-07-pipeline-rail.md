# Task 07 — Pipeline progress rail

> **Context recap:** SSE `step` events carry `node` and `namespace` (outer + inner graph).
> The rail gives users orientation during long runs.
>
> **Rewritten after the BE contract audit:** the old version of this task invented outer
> phase names and a namespace format that do not exist. Everything below is verified
> against `fiscalflow-api` code.

**Docs to read:** BE `app/graph/outer.py` (`build_outer_graph`), `app/graph/registry.py`
(`SECTION_STEP_ORDER`), `app/graph/nodes/base.py` (`make_step_cycle`), `plans/UI_FLOW.md` (Phase D).

## Goal

**Vertical pipeline rail** that updates from SSE `step` events — outer nodes grouped into
display phases, and inner section steps with their plan/approve/execute/review sub-states.

## Dependencies: task 03.

## Scope

**In:** `src/components/pipeline/PipelineRail.tsx`; `src/components/pipeline/pipelineModel.ts`;
`src/hooks/usePipelineProgress.ts` (reducer from `step` events).

**Out:** HITL cards (task 08); layout placement (task 10).

## Outer graph nodes (real — `outer.py:build_outer_graph`)

The outer graph has **13 nodes**, not 5 phases. Group them for display:

| Display phase | BE nodes |
|---|---|
| Ingest | `ingest`, `audit_gate` |
| Plan | `global_plan`, `approve_global` |
| Section loop (×N) | `select_next_section`, `section_plan`, `approve_section`, `run_section`, `review_section`, `collect_section` |
| Review & assemble | `compact_findings`, `cross_section_review`, `assemble_document` |

There is **no** `plan_report`, `section_loop`, `assemble_report`, or `finalize` node —
key the reducer on the names above only.

## Inner section steps (per section)

From BE `SECTION_STEP_ORDER` (`app/graph/registry.py`): `gather_context`, `distill_context`,
`build_outline`, `draft`, `persona_review`, `polish`, `synthesize_claims`, `quality_gate`,
`human_review`.

**Each step is five graph nodes**, and `step` events carry the *node* names:
`{id}.plan`, `{id}.approve`, `{id}.execute`, (`{id}.clarify`,) `{id}.review`, `{id}.join`
(`human_review` is a single `{id}.review` node). The rail must use a **two-level model —
step → phase**: one rail entry per step, with the node suffix driving a sub-state so the
UI can say "planning draft" / "awaiting your approval" / "drafting" / "review the draft".

## Section identity — NOT from the namespace

Inner `step` events arrive as `{"node": "draft.execute", "namespace": ["run_section:<uuid>"]}`.
The namespace carries a **run-instance UUID, not the section id** — the section cannot be
recovered from the event. Track it separately: `current_section_index` +
`selected_sections` (from the start request / `GET /state`), advanced on each
`select_next_section` / `collect_section` step event.

## State model

```typescript
type StepStatus = "pending" | "active" | "done" | "skipped" | "regenerating";
type StepPhase = "plan" | "approve" | "execute" | "clarify" | "review" | null;

type PipelineStep = {
  id: string;            // e.g. "draft" — node suffix stripped
  label: string;
  status: StepStatus;
  phase: StepPhase;      // the active sub-state within the step cycle
  sectionId: string | null; // tracked via the section cursor, not the namespace
};
```

Reducer rules:

- `step` for `"{id}.{suffix}"` → split on the last `.`; update that step's `phase`;
  first event for a step marks the previous active step `done`, this one `active`.
- Outer node names have no suffix — they map to the display phases table above.
- **Loop-aware (mandatory):** a `step` event for a node already `done` means
  **regeneration** (quality-gate failure loops back to `draft.plan` or
  `gather_context.plan`, bounded by `MAX_REGEN=2`; clarification re-runs `execute` up to
  2×; review-gate rejects re-enter `{id}.plan`). Reset that step and everything after it
  to `pending`, mark it `regenerating`, and show a regen badge. A strictly-forward reducer
  will contradict itself on every loop.
- On `interrupt` → keep current step `active`, badge "Awaiting review" (the envelope's
  `step_id`/`phase` tell you which sub-state).
- On `done` → all `done`. On `error` → active step gets `failed` styling.

## UI

- Left rail ~240px; icons + labels; scroll if many inner steps.
- Optional elapsed timer per active step.
- Collapse inner steps under a section header when multiple sections are selected
  (header text from the section cursor).

## Implementation notes

- Seed initial state from the static step list; don't guess completion on reconnect until
  task 11 hydrates from `GET /state` (`values.current_section_index`, `section_state.step_trace`).
- Human-readable labels map (`ingest` → "Ingesting databook", `draft`+`phase:"plan"` →
  "Planning the draft", …).
- **Fallback:** BE acceptance #24 records that inner-step SSE events surfaced
  *inconsistently* in live pilots. Poll `GET /sessions/{id}/status` (now returns a derived
  `awaiting_approval` when paused) as a resilience fallback; never let the rail be the only
  signal that a run is paused — `GET /state → interrupt` is authoritative.

## Verification

- Unit test reducer with a **recorded** SSE fixture (capture with
  `fiscalflow-api/scripts/sse_client.py` against a real run). Do NOT hand-write the
  fixture — hand-written event shapes are how this task previously acquired four
  fabricated node names.
- Fixture must include a regeneration loop (force `verdict: fail` once) to exercise the
  loop-aware reset.
- Visual: mock stream of `step` events updates rail correctly.

## Integration check

Live SSE node names match the reducer's step list (log mismatches in Handoff).

## Definition of done

Pipeline rail + hook; loop-aware reducer tests from a recorded fixture; Handoff notes.

---

## Status: todo

## Handoff notes

_(fill at completion)_
