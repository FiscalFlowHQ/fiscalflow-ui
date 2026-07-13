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
  tier: "global" | "section" | "step",
  phase: "plan" | "review" | "clarification",
  section_id: string | null,
  step_id: string | null,
  content: object,
  allowed_actions: ("approve" | "edit" | "reject" | "answer")[]
}
```

Resume: `POST /sessions/{id}/resume` with `{ action, edited_content? }` → new SSE stream.

## Ingestion status stepper

`uploaded` → `auditing` → `ingesting` → `ready` | `failed`

Disable **Start generation** until `ready`.

## Reconnect

On mount / SSE drop: `GET /sessions/{id}/state` → if `interrupt` present, render review
card; resume with `POST /resume`, not `start`.

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
