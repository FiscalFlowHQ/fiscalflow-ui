# Task 04 — Session home & persistence

> **Context recap:** Each FDD run is keyed by `thread_id` from `POST /sessions`. The UI
> persists a local session list so users can resume after closing the app.

**Docs to read:** `plans/UI_FLOW.md` (Phase A).

## Goal

**Home page** lists sessions, creates new ones, and navigates to `/run/:threadId`. Local
persistence survives refresh.

## Dependencies: task 02.

## Scope

**In:** `src/pages/HomePage.tsx` (real implementation); `src/hooks/useSessionList.ts` or
`src/stores/sessionStore.ts`; `src/types/session.ts` (local metadata).

**Out:** Run workspace internals (task 10); databook upload (task 05).

## Local session model

```typescript
type LocalSession = {
  threadId: string;
  title: string;           // default "FDD run {date}"; user-editable later
  createdAt: string;       // ISO
  lastOpenedAt: string;
  documentRef?: string;
  lastRunStatus?: string;  // from GET /status when opened
};
```

Persist in `localStorage` key `fiscalflow.sessions.v1`.

## User flows

1. **New FDD run** → `createSession()` → append to list → `navigate(/run/:id)`.
2. **Open existing** → update `lastOpenedAt` → navigate.
3. **Delete** (optional MVP) → remove from local list only (BE state remains).
4. On open: optional `getSessionStatus(id)` to show badge (running / paused / completed).

## UI elements

- Session cards: title, created date, status chip, document name if known.
- Empty state: illustration + "Start your first FDD document".
- Backend offline: banner from task 01 health check.

## Implementation notes

- Do not call `start` from Home — only create thread.
- Title edit: inline or defer to task 12.
- Max sessions in list: cap at 50 with "show more" optional.

## Verification

- Create 2 sessions → both appear → refresh → both persist.
- Click session → lands on RunPage stub with correct `threadId` in URL.

## Integration check

`POST /sessions` returns distinct UUIDs (BE task 03).

## Definition of done

Home page functional with local persistence; Handoff updated.

---

## Status: todo

## Handoff notes

_(fill at completion)_
