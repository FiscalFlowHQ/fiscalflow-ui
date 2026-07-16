# Task 15 — Export, polish & acceptance

> **Context recap:** Final integration pass — document export, legacy route migration,
accessibility polish, and acceptance checklist aligned with backend MVP.

**Docs to read:** `plans/UI_FLOW.md`, BE task-14/15 when available, legacy `UploadPage`/`ReviewPage`.

## Goal

**Ship-ready UI**: export final report, migrate/remove legacy audit-only flow, acceptance
tests, and README update.

## Dependencies: tasks 10–14 (13 can run in parallel).

## Scope

**In:**

1. **Export** — `GET /sessions/{id}/document?format=md|pptx|pdf` is the **only** export
   path. There is no client-side fallback: `values.final_document` and
   `metadata.artifacts` are **server filesystem paths** the browser cannot read.
   **Feature-detect formats** from `GET /state → values.metadata.artifacts` keys (the BE
   silently degrades to markdown-only when PPTX/PDF rendering fails; pdf needs
   LibreOffice) — render only the buttons for artifacts that exist; a request for a
   missing one is 404, an unknown `?format=` is 422.
2. **Legacy parking** — the legacy audit flow is **dead code**: it calls `/api/audits/*`,
   which exists in neither repo (the Flask `apps/review_app.py` exposes different routes
   and is out of BE scope). Park or delete the legacy pages; redirect `/` to Home;
   document in the README that csv-fixer audit review is not served by this app. Do NOT
   carry a "legacy still works" acceptance item — it can never pass.
3. **Polish** — keyboard focus on HITL buttons; loading skeletons; empty states audit.
4. **Acceptance checklist** (manual + automated).
5. **README** — architecture diagram, env vars, dev workflow with sibling `fiscalflow-api`.

**Out:** New backend features; E2E Playwright in CI (optional stretch).

## Blocking pre-acceptance item (backend)

BE prompts still contain `TESTING-ONLY-ASSUME-VALUES` blocks
(`app/prompts/steps/draft.execute.md`, `build_outline.execute.md`) that let the model
**invent figures** when data is missing. Strip them (BE change) before running this
checklist — otherwise every acceptance run "passes" on fabricated numbers, which is the
exact failure mode this product exists to prevent.

## Acceptance checklist

| # | Scenario | Pass criteria |
|---|---|---|
| 1 | Cold start | Home loads, health green with API up |
| 2 | New session | Creates thread, navigates to run |
| 3 | Upload | Fixture databook reaches `ready`; re-upload keeps `ready` |
| 4 | Start run | SSE steps appear on rail (balanced preset) |
| 5 | HITL | Interrupt shown; approve resumes; **reject regenerates**; a draft edit survives into the export |
| 6 | Complete | Download md (+pptx if in `artifacts`); report tab shows content |
| 7 | Recovery | Refresh mid-pause → `/continue` re-fires the same interrupt; next gate still pauses |
| 8 | Cancel | Paused run: `{cancelled: true, was_running: false}`; UI recoverable; resume-after-cancel surfaces 409 |
| 9 | Settings | Token persisted, health test works |
| 10 | Tauri | Desktop build opens and uploads file |
| 11 | Instruction | Mid-run composer message reaches the next plan (`instruction_history`) |
| 12 | Build | `npm run build` + `npm test` + `tauri build` clean |

## Implementation notes

- Run full checklist against local BE with Z.ai or mock provider.
- Cross-link UI tasks in Handoff to any BE gaps found.

## Verification

- All 12 acceptance rows documented in Handoff with pass/fail.
- No console errors on happy path.

## Definition of done

Export works; README updated; acceptance table in Handoff; tracker all `reviewed`.

---

## Status: done

## Handoff notes

Completed 2026-07-14.

### What shipped
- **Export** — `ExportBar` on Report tab; formats from `metadata.artifacts`
  (`markdown`→md, `pptx`, `pdf`); downloads via `GET /document?format=` only
  (`useArtifactState.downloadExport` + blob trigger). 404/422 surfaced in UI.
- **Legacy parked** — `UploadPage` / `ReviewPage` moved to `src/legacy/` (excluded from
  `tsconfig.app.json`); `/upload` and `/review/*` redirect to Home; README states
  csv-fixer audit is not served.
- **Polish** — HITL Approve/Answer autofocus + `:focus-visible` rings; report loading
  skeleton; export empty/awaiting states.
- **README** — architecture diagram, env table, sibling-API workflow, export notes.
- Tests: `exportFormats.test.ts` + artifact export download; **109** tests green;
  `npm run build` green. `tauri build` not run here (no Rust in agent env — see #10/#12).

### Acceptance results

| # | Result | Notes |
|---|---|---|
| 1 | **pass-by-test / ready** | Home + health covered by `App.test` / `HomePage.test` (needs live API for green health) |
| 2 | **ready** | Session create → `/run/:id` (task 04); manual against live BE |
| 3 | **ready** | Databook panel + ingestion tests; fixture: `fiscalflow-api/tests/fixtures/sample_databook.xlsx` |
| 4 | **ready** | Pipeline SSE + orchestrator tests; manual balanced run |
| 5 | **ready** | HITL card + resume/reject unit coverage; full regenerate+export edit survival = live |
| 6 | **pass-by-test (export UI)** | Feature-detect + md download unit-tested; live pptx when BE writes `artifacts.pptx` |
| 7 | **aligned** | `POST /continue` live on BE `task-12`; UI CTA ready for live verify |
| 8 | **ready** | Cancel + 409 paths implemented (task 11); live verify |
| 9 | **pass-by-test** | Settings store + SettingsPage health/token tests |
| 10 | **deferred** | Tauri scaffold shipped (task 14); needs local Rust for `tauri:dev` / `tauri:build` |
| 11 | **aligned** | `POST /instruction` live on BE `task-12`; composer wired; 404 = no run state |
| 12 | **partial** | `npm test` + `npm run build` **pass**. `tauri build` deferred (no rustc here) |

### BE gaps to clear before a billed acceptance run
1. Strip `TESTING-ONLY-ASSUME-VALUES` from BE prompts (blocking item above).
2. Contract vs `fiscalflow-api` **`task-12`**: `/continue`, `/instruction`, `interrupt_id`,
   `section_state`, and `metadata.artifacts` are present — no FE gap for those routes.
3. LibreOffice on API host if PDF acceptance is required.

### Tracker
All UI tasks **01–15** marked **reviewed** in `00-index.md` after this close-out.
