# Task 11 — Reconnect, cancel & error handling

> **Context recap:** Runs can outlive the browser tab — but a refresh **kills the stream
> and stops the run** (the disconnect cancels the BE producer task mid-step). Recovery is
> `POST /sessions/{id}/continue`, which re-drives the run from its checkpoint; a paused
> run re-fires its current interrupt. There is no stream re-attach.
>
> **Rewritten after the BE remediation:** `/continue` now exists, `run_status` is derived
> honestly, and cancel semantics changed.

**Docs to read:** BE `app/api/routers/generation.py` (guards on resume/continue/cancel),
`app/api/routers/sessions.py`, `plans/UI_FLOW.md`.

## Goal

**Resilient run lifecycle**: recover on page load via `/continue`, cancel runs, global
error toasts and retry paths.

## Dependencies: task 03, task 10.

## Scope

**In:** `src/hooks/useSessionReconnect.ts`; cancel button wiring; `src/components/feedback/ErrorBanner.tsx`;
`src/components/feedback/Toast.tsx` (or minimal context); orchestrator updates.

**Out:** Offline mode; WebSocket (not used).

## run_status (real enum — `app/graph/state.py`)

`ingesting` | `planning` | `awaiting_approval` | `generating` | `reviewing` | `assembling`
| `completed` | `failed` | `cancelled`. (No `idle` / `running` / `interrupted`.)
`GET /status` reports `awaiting_approval` whenever an interrupt is pending (derived
server-side), and a crashed run now reads `failed`. **The authoritative pause signal is
still `GET /state → interrupt != null`** — use `/status` for cheap polling only.

## Recovery flow

On `RunPage` mount:

1. `getSessionState(threadId)` → hydrate `values`, `section_state`, `interrupt`.
2. If `interrupt != null` → render the HITL card (with its `interrupt_id`); the user
   resumes normally. No `/continue` needed.
3. Else if `next` non-empty and status not terminal → the run was killed mid-step by the
   disconnect. Show "Run was interrupted by the disconnect — resume?" and call
   `POST /sessions/{id}/continue`; its response is a live SSE stream (same handlers as
   start). A paused-at-gate run re-fires the interrupt; a mid-node run re-executes the
   pending node. **Never** re-POST the last resume — a stale resume gets 409.
4. Else render by terminal status (`completed` → Report tab; `failed` → `error.message`;
   `cancelled` → composer).

The Live-tab token buffer is gone after a refresh (tokens are never persisted) — rebuild
prose views from `section_state.draft` / `completed_sections`.

## Cancel flow

- `cancelRun(threadId)` on user confirm; abort in-flight SSE via `AbortSignal`.
- Response: `{ cancelled: true, was_running: boolean, run_status: "cancelled" }` —
  `was_running: false` is the **normal** case for a paused run (no live task to kill);
  it is still cancelled. Unknown thread → 404.
- A cancelled run cannot be resumed or continued (409) — reset to the composer.

## Error handling

| Case | UX |
|---|---|
| SSE `error` | Banner + `message`; `run_status` is now also `failed` server-side; offer "View state" |
| HTTP 409 on start | "Run already active" + recover via flow above |
| HTTP 409 on resume | Stale/duplicate interrupt — refetch `GET /state`, re-render its `interrupt` |
| Network offline | Sticky banner; retry button |
| Upload 413 | "File exceeds the size limit" |
| Upload 503 | "Backend busy" retry |

- `values.error` is a `{ message: string }` dict.
- Don't lose local session on error. Log errors to console in dev only.

## Verification

- Refresh mid-run → recovery banner → `/continue` → the same interrupt re-fires (same
  `interrupt_id`) and the flow proceeds; the *next* gate still pauses.
- Cancel a paused run → `{cancelled: true, was_running: false}`; UI stops; resume
  afterwards → 409 surfaced as "run was cancelled".
- Simulate SSE error → banner shows and `/status` reads `failed`.

## Integration check

BE `GET /state` returns `next`, `interrupt` (with `interrupt_id`) and `section_state`
when paused.

## Definition of done

Recovery + cancel + error UX; Handoff documents any remaining lifecycle gaps.

---

## Status: done

## Handoff notes

Completed 2026-07-14.

### What shipped
- `src/hooks/useSessionReconnect.ts` — `classifySessionReconnect` + `fetchReconnectSnapshot` +
  `continueFromCheckpoint()` (`POST /continue` SSE).
- `useRunOrchestrator` — new phase **`needs_continue`** when `state.next` is non-empty and no
  interrupt; Cancel wired (`confirm` → abort SSE → `cancelRun`); SSE `error` → ErrorBanner +
  toast; offline sticky banner; start **409** re-runs reconnect assessment.
- `ErrorBanner` + `Toast`/`ToastProvider` (AppShell); upload **413/503** copy in
  `useDocumentIngestion`.
- `useHitlResume.abort()` + aborted signal; 409 after cancel surfaces
  "run was cancelled…" when `run_status === cancelled`.
- Tests: continue SSE, continue 404, needs_continue, cancel paused run (93 total green).

### Poll / recovery notes
- Interrupt present → `paused` (no `/continue`).
- `next.length > 0` + non-terminal → **`needs_continue`** banner CTA.
- Active status + empty `next` → **`server_running`** 4s poll (task 10).
- Continue opens a **new** SSE body with the same fan-out as start/resume.

### Remaining lifecycle gaps
- **Live `fiscalflow-api` has no `POST /continue` yet** (only start/resume/cancel in
  `generation.py`). UI targets the remediated contract; 404 → banner explains gap and falls
  back to `server_running` messaging. Ship BE continue before acceptance.
- Live cancel response may omit `was_running` — client already normalizes.
- No global offline queue; sticky banner + reconnect assessment only.
- Cancel uses `window.confirm` — can upgrade to a proper modal later.
