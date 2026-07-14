# Task 12 — Chat: transcript + mid-run instruction composer

> **Context recap:** Both PROJECT_CONTEXT docs lead with "chat is the control surface" —
> the user types what they need in natural language. The BE now has
> `POST /sessions/{id}/instruction`, which appends to `instruction_history` and the
> global feedback channel mid-run. This task builds the real chat: a chronological
> transcript **with a composer**, and the structured review cards inline in the thread.
>
> **Rewritten per user decision:** the old version explicitly excluded a chat input and
> shipped a read-only drawer — that contradicted the product vision.

**Docs to read:** `plans/UI_FLOW.md`, BE `app/api/routers/sessions.py` (`add_instruction`).

## Goal

**Chat panel**: a chronological thread of run events (uploads, steps, interrupts,
decisions, streamed prose) with an always-available composer that sends free-text
instructions to the running graph.

## Dependencies: task 08 (cards), task 10.

## Scope

**In:** `src/components/chat/ChatPanel.tsx`; `src/components/chat/Composer.tsx`;
`src/hooks/useTranscript.ts`; orchestrator appends events; interrupt cards rendered
inline in the thread (reusing task 08 components).

**Out:** Free-form LLM Q&A (the composer routes to `instruction_history`, not to a chat
model).

## The composer → `POST /sessions/{id}/instruction`

```typescript
// body
{ text: string }
// response
{ ok: true, instruction_count: number }
```

- Available whenever a session exists (paused, streaming, or between runs).
- **Scoping (set expectations in the UI):** an instruction reaches the outer-tier
  planner prompts and every *subsequent* section — the section already in flight was
  seeded at entry and won't see it. Show a hint: "Applies from the next planning step."
- Structured decisions still go through the interrupt cards (task 08); the composer is
  for guidance ("focus on churn", "use conservative adjustments"), which also lands in
  the feedback the planners render on regeneration.

## Event types to log

```typescript
type TranscriptEntry =
  | { kind: "system"; text: string; at: string }
  | { kind: "step"; node: string; at: string }
  | { kind: "assistant"; text: string; node: string; at: string } // tokens batched per step
  | { kind: "interrupt"; envelope: InterruptEnvelope; at: string } // rendered as inline card
  | { kind: "decision"; action: string; interruptId: string; reason?: string; at: string }
  | { kind: "instruction"; text: string; at: string }              // from the composer
  | { kind: "error"; message: string; at: string };
```

## UI

- Right-hand panel (or drawer on narrow widths); composer pinned at the bottom.
- Interrupt cards render inline at their position in the thread; answered cards collapse
  to a one-line decision summary (incl. reject reasons).
- Virtualized list if >200 entries (`react-window` optional).
- Copy-to-clipboard export as plain text.
- Persist transcript in `sessionStorage` keyed by `threadId` (optional).

## Implementation notes

- Batch consecutive `token` events into one assistant entry per step boundary (tokens are
  JSON `{text, node, namespace}` — the node gives you the boundary).
- Decisions logged from the task 08 resume hook; bulk-approved plan gates log as compact
  system entries.
- Clear transcript on new run start for same session (confirm UX).

## Verification

- Full manual run produces an ordered thread: upload → steps → interrupt card → decision
  → instruction → assistant prose.
- Send an instruction mid-run → 200, and the *next* section/global plan visibly reflects
  it; `GET /state → values.instruction_history` contains it.
- Refresh → transcript restored if using sessionStorage.

## Definition of done

Chat panel with composer wired to `/instruction`; inline cards; Handoff updated.

---

## Status: todo

## Handoff notes

_(fill at completion)_
