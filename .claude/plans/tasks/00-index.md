# FiscalFlow UI — Implementation Task Index

> **Entry point for every UI implementation session.** Read this file, the one task file
> you are working on, and `plans/UI_FLOW.md`. Backend contract lives in sibling repo
> `fiscalflow-api` — read `app/api/schemas.py` and architecture §8 when a task lists
> endpoints.

## Project snapshot

The desktop app wraps **fiscalflow-api** (FastAPI + LangGraph). Users upload Excel
databooks, watch a **SSE-streamed** FDD pipeline, and **approve/edit** at human-in-the-loop
pauses. MVP is **local-first**: UI talks to `http://localhost:8000` (or Tauri sidecar later).

**Already in repo (legacy — do not rebuild):** dark-theme CSS, audit review components
(`ReviewPage`, sheet viewer, error sidebar) from csv-fixer port. **New work** is the FDD
run workspace under `/run/:threadId`.

## Canonical reading

| Doc | What it is |
|---|---|
| `.claude/PROJECT_CONTEXT.md` | UI product context |
| `.claude/plans/UI_FLOW.md` | Screen map, SSE mapping, layout |
| `fiscalflow-api/.claude/plans/backend-architecture.md` | API contract §8 (backend authority) |
| `fiscalflow-api/app/api/schemas.py` | Request/response TypeScript sources |

## Session protocol

1. **Read**: this index → your task file → `UI_FLOW.md` → relevant backend handoff notes
   (`fiscalflow-api/.claude/plans/tasks/` for API tasks 08–10, 15).
2. **Verify**: `git status`, skim files your task touches; run `fiscalflow-api` locally
   (`uvicorn app.main:app`) for integration tasks.
3. **Implement only your task's scope.** Cross-repo issues → Handoff notes.
4. **Test**: Vitest/RTL where specified; manual against live API for SSE/HITL tasks.
5. **Close out**: update task **Status** + **Handoff notes**; update tracker below.

## Status tracker

| # | Task | Depends on | BE ready | Status | Date | Notes |
|---|---|---|---|---|---|---|
| 01 | [Scaffolding & app shell](task-01-scaffolding.md) | — | 01+ | todo | | |
| 02 | [Types & REST API client](task-02-api-client.md) | 01 | 03, 09 | todo | | |
| 03 | [SSE streaming client](task-03-sse-client.md) | 02 | 08 | todo | | |
| 04 | [Session home & persistence](task-04-sessions.md) | 02 | 03 | todo | | |
| 05 | [Databook upload & ingestion](task-05-databook.md) | 02, 04 | 09 | todo | | |
| 06 | [Run composer](task-06-run-composer.md) | 04, 05 | 08 | todo | | |
| 07 | [Pipeline progress rail](task-07-pipeline-rail.md) | 03 | 08 | todo | | |
| 08 | [HITL review system](task-08-hitl-review.md) | 03, 07 | 04, 08 | todo | | |
| 09 | [Artifact viewers](task-09-artifact-viewers.md) | 08 | — | todo | | |
| 10 | [Run workspace layout](task-10-run-workspace.md) | 05–09 | — | todo | | |
| 11 | [Reconnect, cancel & errors](task-11-lifecycle.md) | 03, 10 | 08 | todo | | |
| 12 | [Chat transcript](task-12-chat-transcript.md) | 10 | — | todo | | |
| 13 | [Settings screen](task-13-settings.md) | 02 | 15 | todo | | Providers API live on BE |
| 14 | [Tauri desktop shell](task-14-tauri.md) | 10 | — | todo | | |
| 15 | [Export, polish & acceptance](task-15-acceptance.md) | 10–14 | 14, 15 | todo | | `GET /document?format=` live on BE |

Statuses: `todo` → `in-progress` → `done` → `reviewed`.

## Dependency shape

```
01 → 02 → 03 ─────────────────────────────┐
     02 → 04 → 05 → 06 ────────────────────┤
              03 → 07 → 08 → 09 → 10 ──────┼→ 11, 12
                         10 → 14 ──────────┤
     02 → 13 ──────────────────────────────┤
                         10–14 → 15 ────────┘
```

Tasks **07–09** can be built with mock SSE fixtures before **10** integrates them.

## Environment notes

- **API must be running** for tasks 04+ integration: `cd fiscalflow-api && uvicorn app.main:app --reload --port 8000`
- **CORS**: backend defaults `http://localhost:1420` (Tauri) and Vite `5173` — add origin in BE settings if needed.
- **No API keys required** for upload/ingest tests (keyless BM25). Generation needs a configured LLM or mocked `get_model` in BE tests only — UI can use real API with Z.ai key.
- **Fixture databook**: `fiscalflow-api/tests/fixtures/sample_databook.xlsx`
- **Manual SSE driver**: `fiscalflow-api/scripts/sse_client.py` — use to verify BE before UI SSE work.

## Backend implementation status (sync point — 2026-07-09)

All 15 backend tasks are **done**. UI can rely on the full contract:

| BE capability | UI task |
|---|---|
| Sessions + checkpointer | 04, 11 |
| SSE start/resume/cancel | 03, 06–11 |
| Documents upload/status | 05 |
| Retrieval + 9-step section graph | 07 (namespace labels) |
| HITL `InterruptEnvelope` + `answer` action | 08 |
| Assembly + `GET /document?format=md\|pptx\|pdf` | 15 |
| `GET/PUT /settings/providers` | 13 |
| Section catalog (`quality_of_earnings`, `business_overview`) | 06 |

Read BE handoffs for deviations: upload keeps **original filename**; `approval_policy` presets
are `thorough` \| `balanced` (not free-form strings); clarification pauses use `action: "answer"`.
