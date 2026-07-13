# Task 07 — Pipeline progress rail

> **Context recap:** SSE `step` events carry `node` and `namespace` (outer + inner graph).
> The rail gives users orientation during long runs.

**Docs to read:** `plans/BACKEND_CONTRACT.md` (outer nodes + regen), BE task-08 handoff,
`app/graph/outer.py`, `app/graph/registry.py`.

## Goal

**Vertical pipeline rail** that updates from SSE `step` events — real outer nodes and inner
section steps — with active/completed/pending/skipped states.

## Dependencies: task 03.

## Scope

**In:** `src/components/pipeline/PipelineRail.tsx`; `src/components/pipeline/pipelineModel.ts`;
`src/hooks/usePipelineProgress.ts` (reducer from `step` events); `src/config/pipelineNodes.ts`.

**Out:** HITL cards (task 08); layout placement (task 10).

## Outer nodes (canonical — from `outer.py`)

Use this exact list; **do not** use fictional names like `plan_report` or `section_loop`:

| Node | Label (suggested) | Notes |
|---|---|---|
| `ingest` | Verify databook | |
| `audit_gate` | Audit gate | Run may END here on failure |
| `global_plan` | Global plan | |
| `approve_global` | Review global plan | Skipped when policy skips gate |
| `select_next_section` | Next section | Repeats per section |
| `section_plan` | Section plan | |
| `approve_section` | Review section plan | Optional gate |
| `run_section` | Generate section | Parent of inner steps |
| `review_section` | Review section output | Optional gate |
| `collect_section` | Collect section | Per-section PPTX written |
| `compact_findings` | Compact findings | May loop back |
| `cross_section_review` | Cross-section review | |
| `assemble_document` | Assemble report | Terminal outer step |

## Inner section steps (under `run_section`)

From `SECTION_STEP_ORDER`: `gather_context`, `distill_context`, `build_outline`, `draft`,
`persona_review`, `polish`, `synthesize_claims`, `quality_gate`, `human_review`.

Nest under current `section_id` (from namespace or `GET /state` → `sections[current_section_index]`).

## Namespace parsing

- `step.data.namespace` is `string[]` from LangGraph (`subgraphs=True`).
- Outer nodes: typically short namespace (e.g. `[]` or one segment).
- Inner steps: deeper paths under `run_section` — **log live samples** in Handoff; do not
  hard-code `section_loop:…` (node does not exist).
- Map `node` name to rail id; use namespace only to group inner steps under the active section.

## State model

```typescript
type StepStatus = "pending" | "active" | "done" | "skipped" | "failed";

type PipelineStep = {
  id: string;           // node name or "run_section:draft"
  label: string;
  status: StepStatus;
  namespace: string[];
  sectionId?: string;
};
```

## Reducer rules

- On `step` for node N: mark previous `active` → `done`, N → `active`.
- **Regen / loop-back:** if N was already `done`, set N → `active` again (do not assume monotonic progress).
- Gate nodes never visited (balanced policy): leave `skipped`, not `pending` forever.
- On `interrupt`: keep current step `active` + badge "Awaiting review".
- On `done`: mark all visited `done`.
- On `error` or `values.run_status === "failed"`: active → `failed`.
- On reconnect (task 11): hydrate from `GET /state` → `next` + `run_status` + `current_section_index`; best-effort only.

## UI

- Left rail ~240px; icons + labels; scroll if many inner steps.
- Section headers when multiple sections selected (collapse inner steps).
- Optional elapsed timer on active step.

## Implementation notes

- Seed from `pipelineNodes.ts`; human-readable labels map.
- Capture fixture: run `sse_client.py` and save first 30 `step` lines for unit tests.

## Verification

- Unit test reducer with recorded `step` sequence from live BE run.
- Regen fixture: same inner step twice → step becomes active again.
- Gate-skipped run (`balanced`) → approve nodes show `skipped`.

## Integration check

Live SSE `node` names match `pipelineNodes.ts` (update config if BE adds nodes).

## Definition of done

Pipeline rail + hook + fixtures; Handoff notes on namespace samples.

---

## Status: todo

## Handoff notes

_(fill at completion)_
