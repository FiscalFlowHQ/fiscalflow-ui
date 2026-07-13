# Task 12 — Chat transcript

> **Context recap:** Users benefit from a chronological view of the run — uploads, steps,
interrupts, approvals, and assistant prose — similar to a chat thread.

**Docs to read:** `plans/UI_FLOW.md` (optional right drawer).

## Goal

**Transcript panel** (collapsible drawer or bottom sheet) logging run events for auditability
and debugging.

## Dependencies: task 10.

## Scope

**In:** `src/components/transcript/TranscriptPanel.tsx`; `src/hooks/useTranscript.ts`;
extend orchestrator to append events.

**Out:** LLM chat input (not in MVP — pipeline is not free-form chat).

## Event types to log

```typescript
type TranscriptEntry =
  | { kind: "system"; text: string; at: string }
  | { kind: "step"; node: string; at: string }
  | { kind: "assistant"; text: string; at: string }      // aggregated tokens per step
  | { kind: "interrupt"; tier: string; at: string }
  | { kind: "user"; action: string; at: string }         // approve/edit/reject/answer
  | { kind: "error"; message: string; at: string };
```

## UI

- Toggle button in run header: "Activity".
- Virtualized list if >200 entries (`react-window` optional).
- Copy-to-clipboard export as plain text.
- Persist transcript in `sessionStorage` keyed by `threadId` (optional).

## Implementation notes

- Batch consecutive `token` events into one assistant entry per step boundary.
- User actions logged from task 08 resume hook.
- Clear transcript on new run start for same session (confirm UX).

## Verification

- Full manual run produces ordered transcript with interrupt + approve entries.
- Refresh → transcript restored if using sessionStorage.

## Definition of done

Transcript panel wired; Handoff updated.

---

## Status: todo

## Handoff notes

_(fill at completion)_
