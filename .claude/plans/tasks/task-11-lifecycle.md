# Task 11 — Reconnect, cancel & error handling

> **Context recap:** Runs can outlive the browser tab. `GET /sessions/{id}/state` and
`/status` restore UI; `POST /cancel` stops active runs; SSE `error` and HTTP failures need
clear recovery UX.

**Docs to read:** BE task-08 handoff (`409`, cancel semantics), `plans/UI_FLOW.md`.

## Goal

**Resilient run lifecycle**: reconnect on page load, cancel in-flight runs, global error
toasts and retry paths.

## Dependencies: task 03, task 10.

## Scope

**In:** `src/hooks/useSessionReconnect.ts`; cancel button wiring; `src/components/feedback/ErrorBanner.tsx`;
`src/components/feedback/Toast.tsx` (or minimal context); orchestrator updates.

**Out:** Offline mode; WebSocket (not used).

## Reconnect flow

On `RunPage` mount:

1. `getSessionStatus(threadId)` → if `running` or interrupt pending:
2. `getSessionState(threadId)` → hydrate pipeline position, interrupt stack, artifacts.
3. If `interrupt` in state → set `interrupted` (show HITL without new SSE until resume).
4. If `running` without local SSE → show banner "Run in progress — reconnecting stream"
   (full stream reconnect may be BE limitation — document in Handoff; MVP: poll status + state).

## Cancel flow

- `cancelRun(threadId)` on user confirm.
- Abort in-flight SSE via `AbortSignal`.
- Reset orchestrator to `ready` or `idle` based on document status.

## Error handling

| Case | UX |
|---|---|
| SSE `error` | Banner + message; offer "View state" |
| HTTP 409 on start | "Run already active" + reconnect |
| Network offline | Sticky banner; retry button |
| Upload 503 | "Backend busy" retry |

## Implementation notes

- Map `run_status` from BE (`idle`, `running`, `interrupted`, `completed`, `failed`, `cancelled`).
- Don't lose local session on error.
- Log errors to console in dev only.

## Verification

- Refresh mid-run → state hydrates (interrupt or status at minimum).
- Cancel → BE returns `cancelled: true`; UI stops spinner.
- Simulate SSE error → banner shows.

## Integration check

BE `GET /state` returns `next` and `interrupt` when paused (task-08).

## Definition of done

Reconnect + cancel + error UX; Handoff documents stream reconnect gaps.

---

## Status: todo

## Handoff notes

_(fill at completion)_
