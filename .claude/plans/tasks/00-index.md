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
| 01 | [Scaffolding & app shell](task-01-scaffolding.md) | — | 01+ | done | 2026-07-14 | Routes, env, AppShell, Vitest/RTL/msw, proxy, health dot |
| 02 | [Types & REST API client](task-02-api-client.md) | 01 | 03, 09 | done | 2026-07-14 | fiscalflow.ts + types/api; ApiError; MSW tests; BE drift noted |
| 03 | [SSE streaming client](task-03-sse-client.md) | 02 | 08 | done | 2026-07-14 | sse.ts + types; start/resume/continue; fixture tests; token drift noted |
| 04 | [Session home & persistence](task-04-sessions.md) | 02 | 03 | done | 2026-07-14 | localStorage sessions; badges; New FDD run → /run/:id |
| 05 | [Databook upload & ingestion](task-05-databook.md) | 02, 04 | 09 | done | 2026-07-14 | DatabookPanel + poll hook; Start gated on ready |
| 06 | [Run composer](task-06-run-composer.md) | 04, 05 | 08 | done | 2026-07-14 | Composer + GET /sections + streamStart; Start gated on ready |
| 07 | [Pipeline progress rail](task-07-pipeline-rail.md) | 03 | 08 | done | 2026-07-14 | Loop-aware reducer + rail; vocab fixture (live capture pending) |
| 08 | [HITL review system](task-08-hitl-review.md) | 03, 07 | 04, 08 | done | 2026-07-14 | InterruptCard/Stack + useHitlResume; 409→state; bulk plan approve |
| 09 | [Artifact viewers](task-09-artifact-viewers.md) | 08 | — | done | 2026-07-14 | 5-tab ArtifactPanel + useArtifactState; section_state drift noted |
| 10 | [Run workspace layout](task-10-run-workspace.md) | 05–09 | — | done | 2026-07-14 | useRunOrchestrator + 3-col layout; 4s server_running poll |
| 11 | [Reconnect, cancel & errors](task-11-lifecycle.md) | 03, 10 | 08 | done | 2026-07-14 | continue CTA + cancel + toasts; live BE missing /continue |
| 12 | [Chat transcript](task-12-chat-transcript.md) | 10 | — | done | 2026-07-14 | ChatPanel + useTranscript; inline HITL; /instruction + 404 degrade |
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
- **CORS**: backend default is `http://localhost:1420` **only** (Tauri). Vite dev on 5173
  works through the same-origin proxy; a `VITE_API_BASE_URL` direct-connect from 5173
  needs `FISCALFLOW_CORS_ORIGINS` extended on the BE.
- **No API keys required** for upload/ingest tests (keyless BM25). Generation needs a configured LLM or mocked `get_model` in BE tests only — UI can use real API with Z.ai key.
- **Fixture databook**: `fiscalflow-api/tests/fixtures/sample_databook.xlsx`
- **Manual SSE driver**: `fiscalflow-api/scripts/sse_client.py` — use to verify BE before UI SSE work, and to **record fixtures** (never hand-write SSE fixtures).

## Backend implementation status (sync point — 2026-07-13, post-remediation)

All 15 backend tasks are done, **plus a HITL/lifecycle remediation pass** (2026-07-13)
that changed the contract. Key points:

| BE capability | UI task |
|---|---|
| Sessions + checkpointer | 04, 11 |
| SSE start/resume/**continue**/cancel | 03, 06–11 |
| Documents upload/status (ref-keyed storage, 413 size cap, session check) | 05 |
| Retrieval + 9-step section graph (5 nodes per step: `{id}.plan/.approve/.execute/.review/.join`) | 07 |
| HITL `InterruptEnvelope` + `interrupt_id` + `attempt`; reject **regenerates** with `reason` | 08 |
| `GET /state` → `interrupt` + live `section_state`; `GET /status` derives `awaiting_approval` | 09, 11 |
| `GET /sections` catalog; `POST /sessions/{id}/instruction` | 06, 12 |
| Assembly + `GET /document?format=md\|pptx\|pdf` (feature-detect from `metadata.artifacts`) | 15 |
| `GET/PUT /settings/providers` (`available_providers` = objects) | 13 |

Contract essentials every task must respect:
- `POST /resume` **requires `interrupt_id`** (from the SSE `interrupt` event / `GET /state`);
  stale or duplicate resumes get 409 and never touch the next gate.
- The SSE stream **always ends at an interrupt**; a refresh/disconnect cancels the run
  server-side; recovery is `POST /sessions/{id}/continue` (re-fires the pending interrupt).
- `token` events are JSON `{text, node, namespace}`, prose steps only.
- `approval_policy` presets are `thorough` | `balanced`; clarifications use `action: "answer"`.
- `values.error` is `{message: string}`.

**Known caveats (do not over-trust the contract):** BE acceptance #24 (inner-step SSE over
namespaces) is *partial* — live pilots saw inconsistent surfacing; build the `GET /status`
polling fallback (task 07). BE prompts still carry `TESTING-ONLY-ASSUME-VALUES` blocks —
strip before acceptance runs (task 15). The legacy `/api/audits` flow is dead code in both
repos (tasks 01/15).
