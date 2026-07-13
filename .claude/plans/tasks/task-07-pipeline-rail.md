# Task 07 — Pipeline progress rail

> **Context recap:** SSE `step` events carry `node` and `namespace` (outer + inner graph).
> The rail gives users orientation during long runs.

**Docs to read:** BE task-08 handoff (namespace examples), `plans/UI_FLOW.md` (Phase D).

## Goal

**Vertical pipeline rail** that updates from SSE `step` events — outer phases and inner
section steps — with active/completed/pending states.

## Dependencies: task 03.

## Scope

**In:** `src/components/pipeline/PipelineRail.tsx`; `src/components/pipeline/pipelineModel.ts`;
`src/hooks/usePipelineProgress.ts` (reducer from `step` events).

**Out:** HITL cards (task 08); layout placement (task 10).

## Outer phases (canonical order)

Mirror BE outer graph:

1. `ingest`
2. `plan_report`
3. `section_loop` (repeat per section)
4. `assemble_report`
5. `finalize`

## Inner section steps (per section)

From BE `SECTION_STEP_ORDER` (task-11): `gather_context`, `distill_context`,
`build_outline`, `draft`, `persona_review`, `polish`, `synthesize_claims`,
`quality_gate`, `human_review`.

## State model

```typescript
type StepStatus = "pending" | "active" | "done" | "skipped";

type PipelineStep = {
  id: string;
  label: string;
  status: StepStatus;
  namespace: string[];
};
```

Reducer rules:

- First `step` for a node → mark previous active as `done`, new as `active`.
- `namespace` depth distinguishes outer vs inner (`section_loop:quality_of_earnings:gather_context`).
- On `interrupt` → keep current step `active` + badge "Awaiting review".
- On `done` → all `done`.
- On `error` → active step `failed` styling.

## UI

- Left rail ~240px; icons + labels; scroll if many inner steps.
- Optional elapsed timer per active step.
- Collapse inner steps under section header when multiple sections selected.

## Implementation notes

- Seed initial state from static config; don't guess completion on reconnect until task 11
  hydrates from `GET /state`.
- Human-readable labels map (`ingest` → "Ingesting databook").

## Verification

- Unit test reducer with fixture `step` sequence from BE manual run.
- Visual: mock stream of 5 `step` events updates rail correctly.

## Integration check

Namespaces from live SSE match reducer parsing (log mismatches in Handoff).

## Definition of done

Pipeline rail + hook; tests; Handoff notes.

---

## Status: todo

## Handoff notes

_(fill at completion)_
