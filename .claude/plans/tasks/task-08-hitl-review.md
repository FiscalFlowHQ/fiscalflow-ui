# Task 08 — HITL review system

> **Context recap:** When SSE emits `interrupt`, the graph is paused. User approves,
edits, or rejects via `POST /sessions/{id}/resume` with `ResumeRequest`. Envelope shape
from `app/graph/hitl.py`. **Content is structured JSON — not plain markdown.**

**Docs to read:** `plans/BACKEND_CONTRACT.md` (interrupt matrix), BE task-04 handoff,
`app/graph/nodes/outer/__init__.py`, `app/graph/nodes/base.py`, legacy `ReviewPage`.

## Goal

**Interrupt cards** with **tier/phase/key-specific renderers** and resume actions — the core
human review loop for FDD generation.

## Dependencies: task 03, task 07.

## Scope

**In:**

- `src/components/hitl/InterruptCard.tsx` — shell + action bar
- `src/components/hitl/InterruptStack.tsx`
- `src/components/hitl/renderers/` — one renderer per content pattern (below)
- `src/components/hitl/ClarificationForm.tsx`
- `src/hooks/useHitlResume.ts`
- `src/lib/interruptContent.ts` — pick renderer from envelope

**Out:** Artifact panel tabs (task 09); chat (task 12).

## InterruptEnvelope (BE)

```typescript
{
  tier: "global" | "section" | "step";
  phase: "plan" | "review" | "clarification";
  section_id?: string | null;
  step_id?: string | null;
  content: Record<string, unknown>;
  allowed_actions: ("approve" | "edit" | "reject" | "answer")[];
}
```

## ResumeRequest

```typescript
{ action: "approve" | "edit" | "reject" | "answer"; edited_content?: Record<string, unknown> | null }
```

`edited_content` is always a **dict** on the wire (never a bare string).

## Content matrix → renderer (implement all rows)

| tier | phase | `content` shape | Renderer | Edit payload |
|---|---|---|---|---|
| `global` | `review` | `{ content: string }` (global plan) | `PlanMarkdownView` | `{ content: "…" }` |
| `section` | `review` | `{ content, section_id }` (section plan) | `PlanMarkdownView` | `{ content: "…" }` |
| `section` | `review` | `{ completed_sections: [...] }` | `SectionOutputView` | section-scoped feedback string in `{ content }` or patch draft |
| `step` | `plan` | `{ content: string }` (step_plan) | `PlanMarkdownView` | `{ content: "…" }` |
| `step` | `review` | `{ draft: string }` | `DraftMarkdownView` + editor | `{ draft: "…" }` |
| `step` | `review` | `{ evidence_bundle: object }` | `JsonTreeView` / table summary | dict patch if merge step |
| `step` | `review` | `{ structured_outline: object }` | `OutlineView` | dict patch |
| `step` | `review` | `{ claims: array }` | `ClaimsListView` | replace list in `{ claims }` |
| `step` | `review` | `{ quality_verdict: object }` | `QualityVerdictView` | read-only if gate failed |
| `step` | `clarification` | `{ open_questions: string[] }` | `ClarificationForm` | `{ note: "…" }` or `{ answers: [...] }` |

**Fallback:** `JsonTreeView` + raw JSON for unknown shapes (dev-friendly).

Detection order: `phase === "clarification"` → clarification; else inspect top-level keys
in `content` (`draft`, `completed_sections`, `content`, etc.).

## UI behavior

1. On `interrupt` SSE (or reconnect from `GET /state`) → show top card.
2. Header: human section title, step label, tier badge, phase badge.
3. Body: renderer from matrix above (share `MarkdownView` with task 09).
4. Actions per `allowed_actions`:
   - **Approve** → `resume({ action: "approve", edited_content: null })` → parent reopens SSE.
   - **Edit** → inline editor → `resume({ action: "edit", edited_content: <dict per table> })`.
   - **Reject** → confirm → `resume({ action: "reject" })` (loops plan on BE).
   - **Answer** → `ClarificationForm` → `resume({ action: "answer", edited_content: { note } })`
     (match `sse_client.py` / pilot pattern).
5. Disable actions while resume stream is opening; guard double-submit (409).
6. Large content: collapsible sections + scroll; draft editor min-height 200px.

## Reuse from legacy

- `ErrorList` / structured list patterns for claims and verdict issues.
- Sheet viewer **not** in scope unless audit cells referenced in content.

## Implementation notes

- Parent (`useRunOrchestrator`) calls `streamGeneration(..., "resume", …)` after action.
- Log interrupt history for task 12 transcript.
- `balanced` policy → fewer interrupts; test both policies.
- Quality gate review may only appear on **failing** verdict — card may be read-only approve.

## Verification

- Unit tests: `interruptContent.ts` picks correct renderer for 6+ fixture envelopes.
- Mock resume: approve/edit/answer send correct JSON bodies.
- Manual: `approval_policy: thorough` + fixture databook → multiple interrupt types appear.

## Integration check

Resume after approve continues SSE `step` events; clarification uses `action: "answer"`.

## Definition of done

All matrix renderers + resume hook; fixtures; Handoff notes on any unmapped content keys.

---

## Status: todo

## Handoff notes

_(fill at completion)_
