# Task 10 — Run workspace layout

> **Context recap:** The run screen is the primary UX — databook, composer, rail, artifacts,
and HITL in one coordinated layout. Central **orchestrator** owns SSE lifecycle and
reconnect behavior.

**Docs to read:** `plans/UI_FLOW.md`, `plans/BACKEND_CONTRACT.md` (SSE reconnect limit).

## Goal

**Run workspace** at `/run/:threadId`: three-column layout + orchestrator that correctly
handles streaming, pause, terminal, and **server-side run without live SSE** after refresh.

## Dependencies: tasks 05–09.

## Scope

**In:** `src/pages/RunPage.tsx`; `src/hooks/useRunOrchestrator.ts`; `src/styles/run-workspace.css`.

**Out:** Cancel button polish (task 11); chat (task 12).

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Top: title · run_status chip · Cancel (wired in task 11)      │
├──────────┬──────────────────────────────┬───────────────────┤
│ Pipeline │ Artifact panel (09)          │ Databook (05)     │
│ rail (07)│                              │ Composer (06)     │
│          │                              │ HITL stack (08)   │
└──────────┴──────────────────────────────┴───────────────────┘
```

## Orchestrator

```typescript
type OrchestratorPhase =
  | "no_document"    // upload not ready
  | "ready"          // can start
  | "streaming"      // SSE connected
  | "paused"         // interrupt shown; SSE closed
  | "server_running" // BE run in progress but no local SSE (after refresh)
  | "completed"
  | "failed"
  | "cancelled";

// useRunOrchestrator(threadId)
startRun(request): void
resumeRun(body: ResumeRequest): void
// fan-out: pipeline, liveDraft, interruptStack, artifactState
```

### State transitions

- `ready` + Start → `streaming`
- `streaming` + `interrupt` event → `paused`
- `paused` + resume → `streaming`
- `streaming` + `done` → `completed`
- `streaming` + `error` → `failed`
- Mount + `run_status` active + no SSE → **`server_running`** (see below)
- Mount + `state.interrupt` → `paused` (show HITL without SSE)

### SSE reconnect limitation (critical)

The API **cannot** re-attach to an in-flight stream. On refresh while BE is still running:

1. Set phase → `server_running`.
2. Show banner: "Run in progress on server — live preview unavailable until the next pause
   or completion."
3. Poll `getSessionStatus` + `getSessionState` every 4s (task 11 hook).
4. When `interrupt` appears → `paused` + render HITL from `state.interrupt`.
5. When `run_status === "completed"` → `completed` + hydrate artifacts.

Do **not** spin a fake token stream or leave `streaming` indefinitely.

## Implementation notes

- Single SSE connection; guard double-start/resume.
- Load `documentRef` from local session on mount; trigger reconnect check immediately.
- HITL stack in right column — expand artifact panel width on pause if needed (CSS).
- Breadcrumb: Home → session title.

## Verification

- Happy path: upload → start → rail + tokens + interrupt (with LLM key).
- Refresh during `server_running` → banner, no hung spinner; pause still recoverable.
- Layout at 1280px and 768px.

## Definition of done

Integrated workspace + orchestrator phases; Handoff documents poll interval choice.

---

## Status: done

## Handoff notes

Completed 2026-07-14.

### What shipped
- `src/hooks/useRunOrchestrator.ts` — phase machine:
  `no_document | ready | streaming | paused | server_running | completed | failed | cancelled`.
  Fans out SSE to pipeline + artifacts + HITL; `startRun` / `resumeRun` with double-start
  guard; mount reconnect via `GET /status` + `GET /state`.
- `src/pages/RunPage.tsx` — thin layout shell: breadcrumb Home → session title, status chip,
  Cancel placeholder (disabled until task 11), three-column workspace.
- `src/styles/run-workspace.css` — 1280 / 1100 / 768 breakpoints; artifact column widens on
  `--paused`; `server_running` banner chrome.
- Tests: `server_running` banner, mount hydrate from interrupt, poll → paused, double-start
  guard (`classifyReconnectStatus` helper). **86** tests green; build green.

### Poll interval
- **`ORCHESTRATOR_POLL_MS = 4000`** (4s) for `server_running` status/state polling — matches
  task 10/11 guidance. Tests can pass `{ pollMs }` to speed up.

### Refresh / SSE reconnect behavior (task 10 scope)
- On mount with active `run_status` and no interrupt → **`server_running`** + banner:
  "Run in progress on server — live preview unavailable until the next pause or completion."
- Poll until `state.interrupt` → **`paused`** (HITL from envelope) or terminal status.
- Does **not** call `POST /continue` yet — that is task 11 (`useSessionReconnect`).
- Do not fake a token stream while `server_running`.

### For task 11 / 12
- Wire Cancel (`cancelDisabled` placeholder) + abort in-flight SSE.
- Add `/continue` recovery when `next` is non-empty and no interrupt (disconnect mid-node).
- Chat transcript can read orchestrator phase + `hitl.history`.
