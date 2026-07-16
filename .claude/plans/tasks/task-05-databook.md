# Task 05 — Databook upload & ingestion status

> **Context recap:** Upload is async — `POST /documents` returns `document_ref` immediately;
> UI polls `GET /documents/{ref}/status` until `ready` or `failed`. See BE task-09 handoff
> (filename stability for `workbook_id`).

**Docs to read:** `plans/UI_FLOW.md` (Phase B), BE task-09.

## Goal

**Databook panel** on the run screen: upload `.xlsx`, show ingestion stepper, gate
generation until `ready`.

## Dependencies: task 02, task 04 (thread_id in route).

## Scope

**In:** `src/components/databook/DatabookPanel.tsx`; `src/hooks/useDocumentIngestion.ts`;
wire into `RunPage` shell (layout detail in task 10).

**Out:** Full workspace layout (task 10); audit drill-down UI (task 15).

## User flow

1. User drops file or clicks upload (web: `<input type="file">`; Tauri: task 14 picker).
2. `uploadDocument(threadId, file)` → store `documentRef` in local session + component state.
3. Poll `getDocumentStatus(ref)` every 1.5s until terminal state.
4. Show stepper: Uploaded → Auditing → Ingesting → Ready / Failed.
5. On `failed`: show `error` + "Try again" (re-upload).
6. On `ready`: emit "ready" to parent — enable Start button (task 06).

## Status UI mapping

| BE `status` | Label | Icon |
|---|---|---|
| `uploaded` | Queued | ○ |
| `auditing` | Auditing workbook… | ◐ |
| `ingesting` | Extracting & indexing… | ◐ |
| `ready` | Ready | ✓ |
| `failed` | Failed | ✗ |

Show `audit_status` when present (e.g. `passed` / `failed`).

## Implementation notes

- Accept `.xlsx`, `.xls`, `.xlsm`, `.xlsb` (match BE).
- Display truncated `document_ref` + original filename.
- Stop polling on unmount; restart if `documentRef` changes.
- Uploads are stored under `upload_dir/<document_ref>/<filename>` on the BE — same-name
  files from different sessions can't clobber each other, and re-uploading identical
  bytes of an already-`ready` document keeps its status (no re-ingestion). Oversized
  uploads get 413; an unknown `thread_id` gets 404.
- Use `fiscalflow-api/tests/fixtures/sample_databook.xlsx` for manual QA (~seconds).

## Verification

- Upload fixture → stepper reaches Ready within ~30s keyless.
- Mock `failed` status → error UI, Start stays disabled.
- Poll stops when component unmounts (no leak).

## Integration check

`document_ref` from upload equals content-hash id (BE acceptance #22).

## Definition of done

Databook panel + polling hook; Handoff notes.

---

## Status: done

## Handoff notes

Completed 2026-07-14.

### What shipped
- `src/hooks/useDocumentIngestion.ts` — upload + 1.5s poll until `ready`/`failed`;
  stops on unmount; accepts `.xlsx/.xls/.xlsm/.xlsb`.
- `src/components/databook/DatabookPanel.tsx` — dropzone, stepper
  (Queued → Auditing → Ingesting → Ready/Failed), audit_status, truncated ref,
  Try again.
- `RunPage` — databook panel + **Start generation** gated on `ready` (button remains
  no-op until task 06); persists `documentRef` via `patchSession`.
- Tests: hook poll/fail/unmount + panel Start gate (54 total green); build green.

### Contract for task 06
- Gate Start on `databookReady` / `onReadyChange(true, documentRef)`.
- Pass `documentRef` into `StartGenerationRequest.document_ref` (or rely on BE
  session-bound active document).
- Do not start while status is non-`ready`.

### Manual QA
- Fixture: `fiscalflow-api/tests/fixtures/sample_databook.xlsx` → Ready in ~seconds
  keyless with API on `:8000`.

### Notes
- Live BE upload path notes (task-09): original filename kept for workbook_id stability.
- UI still tolerant of missing 413/404 session checks if BE hasn't hardened them yet.
- Full multi-pane workspace layout is still task 10; this is a functional shell panel.
