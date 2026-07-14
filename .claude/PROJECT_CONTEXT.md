# FiscalFlow UI — Project Context

> Written 2026-07-06. Canonical "what the desktop UI is and why" doc for `fiscalflow-ui`.
> Backend design authority lives in sibling repo `fiscalflow-api/.claude/plans/backend-architecture.md`.

## TL;DR

We are building a **Tauri + React desktop app** that lets non-technical finance users
**generate FDD documents** from Excel databooks. The UI is a **ChatGPT-style workspace**:
upload a databook, watch the pipeline run step-by-step over **SSE**, review outputs at
each human-in-the-loop pause, and export the final document. The UI is **transport only** —
all generation logic lives in `fiscalflow-api`.

## The two repos

| Repo | Role | Status |
|---|---|---|
| **fiscalflow-api** | FastAPI + LangGraph backend; SSE, sessions, documents, HITL, assembly | Tasks 01–15 **done** (see `fiscalflow-api/.claude/plans/tasks/00-index.md`) |
| **fiscalflow-ui** | React SPA → Tauri desktop shell | **This repo.** Legacy audit-only UI exists; FDD workspace is the target |

## What the UI does (end to end)

1. **Session** — create or resume a conversation thread (`thread_id`).
2. **Upload** — user picks a databook; backend audits + ingests in background.
3. **Configure** — user selects FDD sections, optional instruction, approval preset.
4. **Generate** — SSE stream shows pipeline steps + live draft tokens.
5. **Review** — at each pause, user approves / edits / rejects via one resume contract.
6. **Complete** — view and export the assembled document.

## UX principles

- **Chat is the control surface** — natural language + structured review cards.
- **Pipeline rail shows progress** — outer graph + inner section steps (namespace-aware).
- **Artifact panel shows what to review** — plan, evidence, outline, draft, etc.
- **Databook panel shows ingestion** — poll until `ready` before enabling Start.
- **One resume route** — every pause uses the same `InterruptEnvelope` + `POST /resume`.

## Backend contract (fixed — do not invent endpoints)

Read `.claude/plans/BACKEND_CONTRACT.md` first, then `fiscalflow-api/app/api/schemas.py` and
`backend-architecture.md` §8. Key endpoints:

| Endpoint | Purpose |
|---|---|
| `POST /sessions` | New `thread_id` |
| `GET /sections` | Section catalog for the composer |
| `POST /documents` | Upload databook + bind to session (413 over size cap; 404 unknown session) |
| `GET /documents/{ref}/status` | Poll ingestion |
| `POST /sessions/{id}/start` | SSE generation start |
| `POST /sessions/{id}/resume` | SSE resume after pause — **requires `interrupt_id`**; stale/duplicate → 409 |
| `POST /sessions/{id}/continue` | SSE re-drive from checkpoint (recovery after refresh/disconnect; re-fires the pending interrupt) |
| `POST /sessions/{id}/instruction` | Mid-run natural-language instruction (chat composer) |
| `GET /sessions/{id}/state` | Reconnect: `values`, `next`, `interrupt` (+`interrupt_id`), live `section_state` |
| `GET /sessions/{id}/status` | `run_status` (derives `awaiting_approval` when paused), `audit_status`, section index |
| `POST /sessions/{id}/cancel` | Abort run → `{cancelled, was_running, run_status}`; 404 if never ran |
| `GET /sessions/{id}/document?format=` | Download assembled report (`md` / `pptx` / `pdf`) — the only export path |
| `GET/PUT /settings/providers` | Provider prefs (BE task 15 — live) |

SSE events: `step` (`{node, namespace}`), `token` (`{text, node, namespace}` — prose steps
only), `interrupt` (`{interrupt_id, ...envelope}`, **ends the stream**), `done`, `error`.
Review-gate `reject` regenerates the step with the supplied `reason`; edits are validated
against the step's output type.

## Tech stack

| Layer | Choice |
|---|---|
| UI | React 19 + TypeScript |
| Build | Vite 6 |
| Routing | react-router-dom |
| Desktop | Tauri v2 (task 14) |
| API | `fetch` + SSE (no axios required for MVP) |
| State | React context + hooks (Zustand optional later) |

Dev: Vite proxies `/api` → `http://localhost:8000` today. Tauri uses `VITE_API_BASE_URL`.

## Legacy code (dead — park it, don't preserve it)

Current routes `/` and `/review/:auditId` call `/api/audits/*` — an API that exists in
**neither repo** (the Flask app in `fiscalflow-api/apps/review_app.py` exposes different
routes and is declared out of BE scope). The legacy flow cannot work as-is; keep the pages
compiling until task 15 parks or deletes them, and never treat "audit review reachable" as
an acceptance criterion.

## Implementation protocol

Same as backend: read `plans/tasks/00-index.md` → one task file → implement → test →
update Handoff notes → next task.
