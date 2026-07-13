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

## Status: todo

## Handoff notes

_(fill at completion)_
