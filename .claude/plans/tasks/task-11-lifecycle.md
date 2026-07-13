# Task 11 — Reconnect, cancel & error handling

> **Context recap:** Runs can outlive the browser tab. State endpoints restore UI; cancel
aborts server work; HTTP/SSE errors need recovery paths. **No mid-run SSE reattach.**

**Docs to read:** `plans/BACKEND_CONTRACT.md`, BE task-08 handoff.

## Goal

**Resilient lifecycle**: reconnect on mount, poll while server runs without SSE, cancel,
comprehensive error UX.

## Dependencies: task 03, task 10.

## Scope

**In:** `src/hooks/useSessionReconnect.ts`; `src/hooks/useRunPolling.ts`; cancel wiring;
`src/components/feedback/ErrorBanner.tsx`; `src/components/feedback/Toast.tsx`;
`src/lib/runStatusBadge.ts` (shared with task 04).

**Out:** Offline queueing; WebSocket.

## Reconnect flow (on `RunPage` mount)

1. `getSessionStatus(threadId)` + `getSessionState(threadId)` in parallel.
2. If `state.interrupt` → orchestrator `paused`; render HITL from envelope.
3. If `run_status` ∈ `{ ingesting, planning, awaiting_approval, generating, reviewing, assembling }`
   and no local SSE → `server_running` + start polling.
4. If `completed` / `failed` / `cancelled` → hydrate artifacts + rail best-effort from `values` + `next`.
5. Never call `start` when `interrupt` present — use `resume` only.

## Polling (`useRunPolling`)

- Interval: 4s while `server_running`; stop on terminal status or `interrupt`.
- On `interrupt` → stop poll, show HITL.
- On `completed` → stop poll, refresh artifacts, enable export.

## Cancel flow

- Confirm dialog → `cancelRun(threadId)`.
- `AbortSignal` on active SSE fetch.
- Expect `{ cancelled: true, run_status: "cancelled" }`.

## Error handling matrix

| Case | UX |
|---|---|
| SSE `error` | Banner + `values.error` if available; "View state" |
| HTTP **401** | "Invalid API token" → link Settings |
| HTTP **400** | Show `detail` (bad section/policy) |
| HTTP **409** start/resume | "Run already active" — offer poll/reconnect |
| HTTP **404** document download | "Report not ready yet" |
| HTTP **503** | "Backend starting — retry" |
| `run_status: failed` + `values.error` | Failed banner (ingest/audit_gate/runtime) |
| Network offline | Sticky banner + retry |
| Upload 503 | Retry upload |

## `run_status` reference (backend — do not invent values)

`ingesting` | `planning` | `awaiting_approval` | `generating` | `reviewing` |
`assembling` | `completed` | `failed` | `cancelled`

There is **no** `idle`, `running`, or `interrupted` on the wire. Map to UI in orchestrator only.

## Implementation notes

- Process restart + resume: BE checkpoint survives — UI uses same `thread_id` + `resume`.
- Double-click approve: disable button until SSE opens (409 guard).
- Don't drop local session on errors.

## Verification

- Refresh at pause → HITL restored without `start`.
- Refresh mid-run (no pause) → `server_running` banner + eventual completion or pause.
- Cancel → spinner stops; `cancelled` status.
- Wrong token → 401 toast.

## Definition of done

Reconnect + poll + cancel + full error matrix; Handoff notes.

---

## Status: todo

## Handoff notes

_(fill at completion)_
