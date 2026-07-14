# FiscalFlow UI — Flow Reference

> Companion to task files. Full narrative for designers/implementers.
> Backend contract: `fiscalflow-api/.claude/plans/backend-architecture.md` §8.

## Routes (target)

| Route | Screen |
|---|---|
| `/` | Session home — list + New FDD run |
| `/run/:threadId` | Main workspace (chat + pipeline + artifact + databook) |
| `/settings` | API URL, token, provider, defaults |
| `/review/:auditId` | Legacy audit review (deprecate in UI task 15) |

## Happy path

```
New session → Upload databook → Poll until ready → Select sections → Start (SSE)
  → step events → interrupt → user approves/edits → resume (SSE) → … → done → export
```

## SSE → UI mapping

| Event | UI |
|---|---|
| `step` | Pipeline rail node complete (`node`, `namespace`) |
| `token` | Append to artifact panel (prose steps) |
| `interrupt` | Show HITL review card; wait for user |
| `done` | Run complete; show final document |
| `error` | Toast + recovery via `GET /state` |

## InterruptEnvelope (every pause)

```typescript
{
  interrupt_id: string,               // resume token — required back on POST /resume
  tier: "global" | "section" | "step",
  phase: "plan" | "review" | "clarification",
  section_id: string | null,
  step_id: string | null,
  content: object,                    // review: { [output_key]: value, attempt: n }
  allowed_actions: ("approve" | "edit" | "reject" | "answer")[]
}
```

Resume: `POST /sessions/{id}/resume` with
`{ action, interrupt_id, edited_content?, reason? }` → new SSE stream. A stale/duplicate
`interrupt_id` gets 409 (refetch `GET /state`). `reject` regenerates the step using
`reason` as feedback. Mid-run free-text guidance goes to
`POST /sessions/{id}/instruction` (chat composer).

## Ingestion status stepper

`uploaded` → `auditing` → `ingesting` → `ready` | `failed`

Disable **Start generation** until `ready`.

## Recovery (reconnect)

The SSE stream always ends at an interrupt, and a refresh/disconnect **cancels the run
server-side**. On mount: `GET /sessions/{id}/state` → if `interrupt` present, render the
review card (resume with `POST /resume` + its `interrupt_id`); else if `next` non-empty
and status non-terminal, offer `POST /sessions/{id}/continue` — it re-drives the
checkpoint and re-fires the pending interrupt. Never re-POST a previous resume.

## Export (after `done`)

`GET /sessions/{threadId}/document?format=md|pptx|pdf` — 404 until run completed.
Default (no `format`) serves best available (`pdf` > `pptx` > `md`).

## Clarification pauses

When `phase: "clarification"` and `allowed_actions` includes `"answer"`, render a Q&A form
from `content` and resume with `{ action: "answer", edited_content: { … } }`.

## Layout (run workspace)

```
┌ TopBar: title, cancel, settings ─────────────────────────────┐
├ Sessions │ Pipeline rail │ Chat + Artifact panel │ Databook ─┤
└ Composer: sections, instruction, policy, Start ──────────────┘
```
