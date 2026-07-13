# Task 15 — Export, polish & acceptance

> **Context recap:** Final integration — export, legacy migration, polish, acceptance.

**Docs to read:** `plans/BACKEND_CONTRACT.md`, BE task-14/15, legacy pages.

## Goal

Ship-ready UI with export, legacy route migration, and documented acceptance.

## Dependencies: tasks 10–14 (13 parallel).

## Scope

### 1. Export

- Primary: `GET /sessions/{id}/document?format=md|pptx|pdf` → save via blob download.
- Buttons: Markdown, PowerPoint, PDF (disable PDF if 404 — no LibreOffice on server).
- Default download (no format): best available artifact.
- Fallback copy: show `completed_sections[].draft` in UI only — not a file export.
- **Optional:** per-section pptx if `metadata.artifacts` exposes section paths after `collect_section`.

### 2. Legacy migration

- Move audit UI: `/audit` → `UploadPage`, keep `/review/:auditId`.
- `/` → `HomePage` (FDD).
- Document csv-fixer legacy scope in README.

### 3. Polish

- HITL keyboard focus; loading skeletons; empty states.
- `server_running` banner copy review (task 10/11).

### 4. Testing

- Vitest suite green (tasks 02–03 + component tests).
- Optional: Playwright happy path (stretch).

### 5. README

- Two-repo dev workflow, env vars, acceptance checklist reference.

## Acceptance checklist

| # | Scenario | Pass criteria |
|---|---|---|
| 1 | Cold start | Home loads; health green |
| 2 | New session | Creates thread → run page |
| 3 | Upload | Fixture → `ready` |
| 4 | Provider gate | Start blocked without `key_present` |
| 5 | Start run | SSE steps on rail |
| 6 | HITL | Structured interrupt card; approve resumes |
| 7 | Clarification | Answer form works if triggered |
| 8 | Complete | Download md + pptx |
| 9 | Reconnect | Refresh at pause → HITL restored |
| 10 | Server running | Refresh mid-run → banner, no hung spinner |
| 11 | Cancel | Run stops |
| 12 | Settings | Token + provider persist |
| 13 | Tauri | Desktop upload works |
| 14 | Legacy | `/audit` still works if kept |
| 15 | Build | `npm run build` (+ `tauri build`) clean |

## Definition of done

Export + migration + 15-row acceptance in Handoff; tracker reviewed.

---

## Status: todo

## Handoff notes

_(fill at completion)_
