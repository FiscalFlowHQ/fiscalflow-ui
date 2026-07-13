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
| `POST /documents` | Upload databook + bind to session |
| `GET /documents/{ref}/status` | Poll ingestion |
| `POST /sessions/{id}/start` | SSE generation start |
| `POST /sessions/{id}/resume` | SSE resume after pause |
| `GET /sessions/{id}/state` | Reconnect / pending interrupt |
| `GET /sessions/{id}/status` | `run_status`, `audit_status`, section index |
| `POST /sessions/{id}/cancel` | Abort run |
| `GET /sessions/{id}/document?format=` | Download assembled report (`md` / `pptx` / `pdf`) |
| `GET/PUT /settings/providers` | Provider prefs (BE task 15 — live) |

SSE events: `step`, `token`, `interrupt`, `done`, `error`.

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

## Legacy code (do not delete until task 15)

Current routes `/` and `/review/:auditId` target the **old Flask audit API** (`/api/audits`).
The new FDD flow uses `fiscalflow-api` endpoints above. Migrate or hide legacy routes in
task 15.

## Implementation protocol

Same as backend: read `plans/tasks/00-index.md` → one task file → implement → test →
update Handoff notes → next task.
