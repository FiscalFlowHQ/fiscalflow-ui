# FiscalFlow UI — Flow Reference

> Companion to task files. Backend authority: `plans/BACKEND_CONTRACT.md` and
> `fiscalflow-api/.claude/plans/backend-architecture.md` §8.

## Routes (target)

| Route | Screen |
|---|---|
| `/` | Session home — list + New FDD run |
| `/run/:threadId` | Main workspace |
| `/settings` | API URL, token, provider |
| `/audit` | Legacy upload (task 15) |
| `/review/:auditId` | Legacy audit review |

## Happy path

```
New session → Upload databook → Poll until ready → Provider check → Select sections
  → Start (SSE) → step events → interrupt → approve/edit/answer → resume (SSE)
  → … → done → download md/pptx
```

## SSE → UI mapping

| Event | UI |
|---|---|
| `step` | Pipeline rail (`node`, `namespace[]`) |
| `token` | Live draft (plain text) |
| `interrupt` | HITL card (structured renderer) |
| `done` | Complete; fetch state + enable export |
| `error` | Banner + `GET /state` |

## InterruptEnvelope

See `BACKEND_CONTRACT.md` for full content matrix. Resume always:
`POST /sessions/{id}/resume` with `{ action, edited_content? }` → new SSE stream.

## Ingestion stepper

`uploaded` → `auditing` → `ingesting` → `ready` | `failed`

Disable **Start** until `ready` **and** provider `key_present`.

## Reconnect & SSE limitation

On mount:

1. `GET /status` + `GET /state`
2. If `interrupt` → show HITL; resume with `POST /resume` (never `start`)
3. If run active but no SSE (page refresh) → **`server_running`** banner + poll every ~4s
4. **Cannot** re-attach to in-flight SSE for live tokens

## `run_status` badges (home + run header)

Backend values only — pause = `state.interrupt != null`. See `BACKEND_CONTRACT.md`.

## Export (after `completed`)

`GET /sessions/{threadId}/document?format=md|pptx|pdf`

Preview sections from `values.completed_sections[].draft` (not `final_report`).

## Layout (run workspace)

```
┌ TopBar: title, status chip, cancel, settings ───────────────┐
├ Pipeline rail │ Artifact panel │ Databook + Composer + HITL ─┤
└──────────────────────────────────────────────────────────────┘
```
