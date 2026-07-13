# Task 04 — Session home & persistence

> **Context recap:** Each FDD run is keyed by `thread_id` from `POST /sessions`. The UI
> persists a local session list so users can resume after closing the app.

**Docs to read:** `plans/UI_FLOW.md`, `plans/BACKEND_CONTRACT.md` (`run_status` badges).

## Goal

**Home page** lists sessions, creates new ones, and navigates to `/run/:threadId`. Local
persistence survives refresh. Status chips use **backend** `run_status` + pause detection.

## Dependencies: task 02.

## Scope

**In:** `src/pages/HomePage.tsx`; `src/hooks/useSessionList.ts` or `src/stores/sessionStore.ts`;
`src/types/session.ts`; `src/lib/runStatusBadge.ts`.

**Out:** Run workspace internals (task 10); databook upload (task 05).

## Local session model

```typescript
type LocalSession = {
  threadId: string;
  title: string;
  createdAt: string;
  lastOpenedAt: string;
  documentRef?: string;
  lastRunStatus?: RunStatus | null;  // from GET /status
  paused?: boolean;                  // from GET /state interrupt != null
};
```

Persist in `localStorage` key `fiscalflow.sessions.v1`.

## Status badge mapping (use `runStatusBadge.ts`)

| Condition | Chip |
|---|---|
| Never started / no status | Draft |
| `run_status` in `ingesting`…`assembling` and no interrupt | Running |
| `interrupt` present on `GET /state` | Awaiting review |
| `completed` | Complete |
| `failed` | Failed |
| `cancelled` | Cancelled |

Refresh badges when opening Home (batch `getSessionStatus`; optionally `getSessionState` for
`paused` on visible cards).

## User flows

1. **New FDD run** → `createSession()` → append → `navigate(/run/:id)`.
2. **Open existing** → update `lastOpenedAt` → navigate.
3. **Delete** (optional) → local list only.
4. On list load: refresh status for each card (debounced; max 10 parallel).

## UI elements

- Session cards: title, created date, status chip, document ref truncated.
- Empty state + backend offline banner (task 01 health).

## Implementation notes

- Do not call `start` from Home.
- `run_status` has no `interrupted` value — pause comes from `state.interrupt`.

## Verification

- Two sessions persist across refresh; chips update after a paused run.

## Definition of done

Home + persistence + correct badges; Handoff updated.

---

## Status: todo

## Handoff notes

_(fill at completion)_
