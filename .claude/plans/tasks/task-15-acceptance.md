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

1. **Export** — Primary: `GET /sessions/{id}/document?format=md|pptx|pdf` (BE task-14).
   Fallback: assemble markdown client-side from `GET /state` → `values.final_document` /
   `metadata.artifacts`. Show format buttons; 404 when pdf unavailable (no LibreOffice).
2. **Legacy migration** — Move audit UI to `/audit` or remove if superseded; redirect `/`
   to Home; document what remains for csv-fixer workflows.
3. **Polish** — keyboard focus on HITL buttons; loading skeletons; empty states audit.
4. **Acceptance checklist** (manual + automated).
5. **README** — architecture diagram, env vars, dev workflow with sibling `fiscalflow-api`.

**Out:** New backend features; E2E Playwright in CI (optional stretch).

## Acceptance checklist

| # | Scenario | Pass criteria |
|---|---|---|
| 1 | Cold start | Home loads, health green with API up |
| 2 | New session | Creates thread, navigates to run |
| 3 | Upload | Fixture databook reaches `ready` |
| 4 | Start run | SSE steps appear on rail |
| 5 | HITL | Interrupt shown; approve resumes |
| 6 | Complete | Download md/pptx; report tab shows content |
| 7 | Reconnect | Refresh mid-pause restores interrupt |
| 8 | Cancel | Run stops, UI recoverable |
| 9 | Settings | Token persisted, health test works |
| 10 | Tauri | Desktop build opens and uploads file |
| 11 | Legacy | Audit review still reachable if kept |
| 12 | Build | `npm run build` + `tauri build` clean |

## Implementation notes

- `downloadMarkdown(filename, content)` utility.
- Run full checklist against local BE with Z.ai or mock provider.
- Cross-link UI tasks in Handoff to any BE gaps found (e.g. missing `final_report` field).

## Verification

- All 12 acceptance rows documented in Handoff with pass/fail.
- No console errors on happy path.

## Definition of done

Export works; README updated; acceptance table in Handoff; tracker all `reviewed`.

---

## Status: todo

## Handoff notes

_(fill at completion)_
