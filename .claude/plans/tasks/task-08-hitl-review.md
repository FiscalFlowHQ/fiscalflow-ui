# Task 08 — HITL review system

> **Context recap:** When SSE emits `interrupt`, the graph is paused. User approves,
edits, or rejects via `POST /sessions/{id}/resume` with `ResumeRequest`. Envelope shape
from `app/graph/hitl.py`.

**Docs to read:** BE task-04 handoff, `plans/UI_FLOW.md` (Phase E), legacy `ReviewPage`
components for reuse ideas.

## Goal

**Interrupt cards** that render tiered HITL content and submit resume actions — the core
human review loop for FDD generation.

## Dependencies: task 03, task 07.

## Scope

**In:** `src/components/hitl/InterruptCard.tsx`; `src/components/hitl/InterruptStack.tsx`;
`src/hooks/useHitlResume.ts`; content renderers by `tier` / `phase`.

**Out:** Artifact deep viewers (task 09); chat (task 12).

## InterruptEnvelope (BE)

```typescript
{
  tier: "global" | "section" | "step";
  phase: "plan" | "review" | "clarification";
  section_id?: string | null;
  step_id?: string | null;
  content: Record<string, unknown>;   // plan, draft under review, or clarification Q&A
  allowed_actions: ("approve" | "edit" | "reject" | "answer")[];
}
```

## ResumeRequest

```typescript
{ action: "approve" | "edit" | "reject" | "answer"; edited_content?: Record<string, unknown> }
```

- **answer** — clarification pauses: `edited_content` carries user answers (shape per `content`).

## UI behavior

1. On `interrupt` SSE → push onto stack (support multiple if BE sends queue).
2. Render `content` as Markdown (use `react-markdown` or simple `<pre>` for MVP).
3. Buttons per `allowed_actions`:
   - **Approve** → `resume({ action: "approve" })` → reopen SSE stream.
   - **Edit** → expandable editor (textarea) → `resume({ action: "edit", edited_content })`.
   - **Reject** → confirm dialog → `resume({ action: "reject" })`.
   - **Answer** (clarification) → form from `content` questions → `resume({ action: "answer", edited_content })`.
4. While resuming: disable buttons, show spinner.
5. Header: section name, step label, tier badge.

## Reuse from legacy

- `ErrorSidebar` patterns for structured issues (if `content` is JSON audit-like).
- Sheet viewer **not** required here unless interrupt references tabular audit — task 09.

## Implementation notes

- After resume, parent must call `streamGeneration(..., "resume", ...)` again (task 10 orchestration).
- Store interrupt history locally for task 12 transcript.
- Handle empty `allowed_actions` gracefully (read-only view).

## Verification

- Mock interrupt envelope → all three actions call correct API body.
- Manual: full run with `approval_policy: always` → at least one interrupt card appears.

## Integration check

Resume after approve continues SSE `step` events (BE task-08).

## Definition of done

HITL components + resume hook; Handoff updated.

---

## Status: todo

## Handoff notes

_(fill at completion)_
