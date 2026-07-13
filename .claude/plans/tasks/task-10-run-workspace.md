# Task 10 — Run workspace layout

> **Context recap:** The run screen is the primary UX — databook, composer, rail, artifacts,
and HITL in one coordinated layout. This task wires tasks 05–09 into `RunPage`.

**Docs to read:** `plans/UI_FLOW.md` (layout diagram).

## Goal

**Run workspace** at `/run/:threadId`: responsive three-column layout with centralized
**run orchestration** (SSE lifecycle).

## Dependencies: tasks 05–09.

## Scope

**In:** `src/pages/RunPage.tsx` (full); `src/hooks/useRunOrchestrator.ts`; layout CSS in
`src/styles/run-workspace.css`.

**Out:** Reconnect/cancel polish (task 11); chat sidebar (task 12).

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Top: session title · status chip · Cancel (stub → task 11)  │
├──────────┬──────────────────────────────┬───────────────────┤
│ Pipeline │ Artifact panel (task 09)     │ Databook (05)     │
│ rail (07)│                              │ Composer (06)     │
│          │                              │ HITL stack (08)   │
└──────────┴──────────────────────────────┴───────────────────┘
```

Mobile: stack vertically — rail horizontal stepper on top.

## Orchestrator responsibilities

```typescript
// useRunOrchestrator(threadId)
state: "idle" | "uploading" | "ready" | "running" | "interrupted" | "done" | "error"
startRun(request): void      // wires SSE handlers to rail, tokens, interrupt
resumeRun(resume): void     // after HITL
// handlers fan-out to: pipeline, liveDraft, interruptStack
```

State machine:

- `idle` → document not ready
- `ready` → can start
- `running` → SSE active, no interrupt
- `interrupted` → show HITL, SSE closed
- `done` / `error` → terminal

## Implementation notes

- Load `documentRef` from local session on mount.
- Single SSE connection at a time — guard double-start.
- Pass `threadId` from `useParams` to all children.
- Breadcrumb: Home → Run title.

## Verification

- End-to-end manual: create session → upload → start → see rail + tokens + interrupt (with API key).
- Layout: 1280px and 768px widths usable.

## Integration check

Full path matches `UI_FLOW.md` happy path.

## Definition of done

Integrated run workspace; Handoff with screenshots or flow notes.

---

## Status: todo

## Handoff notes

_(fill at completion)_
