# FiscalFlow UI — Backend Contract Reference

> TypeScript-oriented mirror of the live `fiscalflow-api` contract. Authority remains
> `fiscalflow-api/app/api/schemas.py`, `app/graph/state.py`, `app/graph/hitl.py`, and
> `backend-architecture.md` §8. Update this file when BE handoffs report drift.

## REST endpoints

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health` | No auth when token unset |
| `POST` | `/sessions` | → `{ thread_id }` |
| `GET` | `/sessions/{id}/state` | → `{ values, next, interrupt }` |
| `GET` | `/sessions/{id}/status` | → `{ run_status, audit_status, current_section_index }` |
| `GET` | `/sessions/{id}/document?format=md\|pptx\|pdf` | Blob download; 404 until `run_status === "completed"` |
| `POST` | `/sessions/{id}/start` | SSE; 400 empty sections / bad policy; 409 active run |
| `POST` | `/sessions/{id}/resume` | SSE; 409 mid-execution |
| `POST` | `/sessions/{id}/cancel` | → `{ cancelled, run_status: "cancelled" }` |
| `POST` | `/documents` | `FormData`: `file`, `thread_id` |
| `GET` | `/documents/{ref}/status` | Poll ingestion |
| `GET` | `/settings/providers` | Key presence only |
| `PUT` | `/settings/providers` | `{ provider, model? }` |

## SSE events (`app/api/streaming.py`)

| Event | `data` | UI consumer |
|---|---|---|
| `step` | `{ node: string, namespace: string[] }` | Pipeline rail |
| `token` | **Plain text** (not JSON-wrapped) | Live draft |
| `interrupt` | `InterruptEnvelope` JSON | HITL stack |
| `done` | `{}` | Terminal success |
| `error` | `{ message: string }` | Error banner |

**Namespace:** tuple from LangGraph `subgraphs=True`. Outer nodes have shallow namespaces;
inner section steps appear under `run_section` with deeper paths. Log live captures in
Handoff — do not assume `section_loop:…` (that node does not exist).

## `run_status` (backend → UI)

Backend values (`ReportState.run_status`):

`ingesting` | `planning` | `awaiting_approval` | `generating` | `reviewing` | `assembling` | `completed` | `failed` | `cancelled`

**Pause is not a `run_status`.** Infer **paused** from `GET /state` → `interrupt !== null`.

Suggested UI session badge mapping:

| BE `run_status` | Badge |
|---|---|
| _(no start yet)_ | Draft |
| `ingesting` … `assembling` | Running |
| + `interrupt` present | Awaiting review |
| `completed` | Complete |
| `failed` | Failed |
| `cancelled` | Cancelled |

Orchestrator UI states (`task-10`) are separate: `idle | ready | streaming | paused | done | error`.

## Outer graph nodes (pipeline rail)

Canonical order from `app/graph/outer.py`:

1. `ingest`
2. `audit_gate`
3. `global_plan` → (optional) `approve_global`
4. `select_next_section` — **repeats** per section
5. `section_plan` → (optional) `approve_section`
6. `run_section` — **subgraph**; inner steps emit nested `step` events
7. (optional) `review_section`
8. `collect_section`
9. `compact_findings` — loops to `select_next_section` or continues
10. `cross_section_review`
11. `assemble_document`

Gate nodes (`approve_global`, `approve_section`, `review_section`) may be **skipped** when
policy is `balanced` — rail should not show them as failed if never visited.

## Inner section steps (`SECTION_STEP_ORDER`)

`gather_context` → `distill_context` → `build_outline` → `draft` → `persona_review` →
`polish` → `synthesize_claims` → `quality_gate` → `human_review`

**Regen loops:** steps can repeat (e.g. back to `gather_context`). Rail marks a revisited
step `active` again; do not assume monotonic forward-only progress.

## `ReportState` fields the UI reads

```typescript
interface ReportState {
  user_request?: string | null;
  databook_ref: string;
  selected_sections: string[];
  global_plan?: { content: string } | null;
  active_section_plan?: { content: string; section_id: string } | null;
  sections: SectionSpec[];
  current_section_index: number;
  completed_sections: CompletedSection[];
  prior_findings: Finding[];
  audit_status: "pending" | "passed" | "failed";
  run_status: RunStatus;  // see above
  error?: string | Record<string, unknown> | null;  // BE typing varies — stringify for display
  metadata?: {
    provider_override?: string;
    artifacts?: { markdown?: string; pptx?: string; pdf?: string };
  };
  final_document: string;  // **filesystem path**, not markdown body
}

interface CompletedSection {
  id: string;
  title?: string;
  order?: number;
  draft?: string;
  claims?: Record<string, unknown>[];
  quality_verdict?: Record<string, unknown> | null;
}
```

## `InterruptEnvelope` + content shapes

```typescript
interface InterruptEnvelope {
  tier: "global" | "section" | "step";
  phase: "plan" | "review" | "clarification";
  section_id: string | null;
  step_id: string | null;
  content: Record<string, unknown>;
  allowed_actions: ("approve" | "edit" | "reject" | "answer")[];
}
```

| tier | phase | Typical `content` | Renderer |
|---|---|---|---|
| `global` | `review` | `global_plan` `{ content }` | Markdown plan |
| `section` | `review` | `active_section_plan` or `{ completed_sections }` | Plan MD / section draft |
| `step` | `plan` | `step_plan` `{ content }` | Markdown plan |
| `step` | `review` | `{ draft }`, `{ evidence_bundle }`, `{ structured_outline }`, `{ claims }`, … | Key-specific viewer |
| `step` | `clarification` | `{ open_questions: [...] }` | Q&A form |

## `ResumeRequest`

```typescript
{ action: "approve" | "edit" | "reject" | "answer"; edited_content?: Record<string, unknown> | null }
```

- **edit:** patch dict — e.g. `{ draft: "…" }`, `{ content: "…" }`, or merge keys for `merge_output` steps.
- **answer:** e.g. `{ note: "…" }` or `{ answers: [...] }` (pilot uses free-form dict; BE accepts `edited_content`).

## SSE reconnect limitation

The API does **not** support re-attaching to an in-flight SSE stream. After refresh while
the server is still running:

- Poll `GET /status` + `GET /state` (every 3–5s optional)
- Show HITL when `interrupt` appears
- Do **not** show a broken live token stream until the next `start`/`resume` connection

## Section catalog (sync from BE)

Copy from `fiscalflow-api/app/domain/sections.yaml` at implementation time. Live MVP:

| id | title | order |
|---|---|---|
| `business_overview` | Business Overview | 1 |
| `quality_of_earnings` | Quality of Earnings | 3 |

Sort checkboxes by `order`. Unknown ids → BE 400 on start.

## HTTP errors the UI must handle

| Status | When |
|---|---|
| 401 | Wrong/missing bearer token |
| 400 | Bad section id, empty sections, unknown policy |
| 404 | Unknown document/session; document download not ready |
| 409 | Start/resume while run active |
| 422 | Unknown download format |
| 503 | Graph/meta not ready |
