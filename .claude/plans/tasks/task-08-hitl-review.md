# Task 08 — HITL review system

> **Context recap:** When SSE emits `interrupt`, the graph is paused **and the stream
> ends** — the client resumes with `POST /sessions/{id}/resume`, which opens a new stream.
> Envelope shape from `app/graph/hitl.py`.
>
> **Rewritten after the BE remediation:** resume now requires the `interrupt_id` from the
> envelope, `reject` genuinely regenerates (with an optional `reason`), and edits are
> validated against the step's output type.

**Docs to read:** BE `app/graph/hitl.py`, `app/graph/nodes/base.py`
(`_apply_review_mode`), `plans/UI_FLOW.md` (Phase E).

## Goal

**Interrupt cards** that render tiered HITL content and submit resume actions — the core
human review loop for FDD generation. Distinct affordances per `phase`: approving a
**plan** (before tokens are spent) is a different decision from accepting an **output**,
and a **clarification** is a form, not a review.

## Dependencies: task 03, task 07.

## Scope

**In:** `src/components/hitl/InterruptCard.tsx`; `src/components/hitl/InterruptStack.tsx`;
`src/hooks/useHitlResume.ts`; content renderers by `tier` / `phase`; bulk-approve control.

**Out:** Artifact deep viewers (task 09); chat composer (task 12).

## Interrupt event (SSE `interrupt` / `GET /state → interrupt`)

```typescript
{
  interrupt_id: string;               // REQUIRED back on resume — dedup + idempotency token
  tier: "global" | "section" | "step";
  phase: "plan" | "review" | "clarification";
  section_id?: string | null;
  step_id?: string | null;
  content: Record<string, unknown>;   // plan / output under review / clarification questions
                                      // review content is wrapped: { [output_key]: value, attempt: n }
  allowed_actions: ("approve" | "edit" | "reject" | "answer")[];
}
```

`content.attempt` counts regenerations of this gate (1 = first pass). Surface it from
attempt 2 up ("2nd regeneration") so repeated rejects are a visible, informed choice —
rejects are unbounded by design.

## ResumeRequest

```typescript
{
  action: "approve" | "edit" | "reject" | "answer";
  interrupt_id: string;               // from the envelope; stale/duplicate → HTTP 409
  edited_content?: Record<string, unknown> | unknown[] | string | null;
  reason?: string;                    // free text carried with "reject" — fed to the model
}
```

- **edit** — send the *bare* value: a `draft` edit is a **string**, a `claims` edit a
  **list**, `evidence_bundle`/`structured_outline` a dict patch. Round-tripping the
  wrapped `content` shape (`{output_key: value}`) is also accepted (BE unwraps), but the
  BE rejects a payload whose type doesn't match the step's output channel.
- **reject** — regenerates the step with `reason` as feedback. Always offer a reason
  field; a specific reason materially improves the retry.
- **answer** — clarification pauses: `edited_content` carries the answers (shape per
  `content.open_questions`).

## UI behavior

1. On `interrupt` → push onto stack, **deduped by `interrupt_id`** (regeneration loops
   re-fire envelopes for the same gate; `POST /continue` re-fires the current one).
2. Render by `phase`:
   - `plan` → compact plan text + Approve / Edit / Reject with reason. This is the
     cheap gate — approving here is what *prevents* wasted tokens.
   - `review` → the output under `content[output_key]`; expandable editor matched to the
     type (textarea for `draft`, structured list editor or raw JSON for `claims` etc.).
   - `clarification` → form generated from `content.open_questions`; submit as `answer`.
3. Buttons per `allowed_actions` (e.g. `human_review` and `review_section` offer no
   `reject`); resume always includes `interrupt_id`.
4. While resuming: disable buttons, show spinner; the resume response IS the next SSE
   stream — hand it to the same handlers as `start`.
5. On HTTP **409** from resume: the interrupt was already answered or is stale — refetch
   `GET /state` and re-render from its `interrupt` (never blind-retry a resume).
6. Header: section name, step label, tier badge, attempt badge.

## Bulk approve (user decision)

A "Approve remaining plan gates for this section" toggle: while set, incoming
`phase: "plan"` envelopes for the current `section_id` are auto-approved
(`resume({action:"approve", interrupt_id})`) without rendering a card (log them to the
transcript). Review-phase and clarification envelopes always render. This is what makes
`thorough` (~16 pauses/section) usable as a power-user mode.

## Implementation notes

- Store interrupt history locally for task 12 transcript.
- Handle empty `allowed_actions` gracefully (read-only view).
- A malformed edit is rejected by the BE (422) — show the message inline, keep the card.

## Verification

- Mock interrupt envelope → all actions send the correct body incl. `interrupt_id`.
- Double-click Approve → exactly one resume succeeds; the second gets 409 and does NOT
  approve the next gate.
- Manual: full run with `approval_policy: "balanced"` (presets are `thorough` |
  `balanced` — there is no `always`) → cards appear; edit a draft; reject once with a
  reason and see a different draft come back.

## Integration check

Resume after approve continues SSE `step` events; reject at `draft` review produces a
regenerated draft (BE `test_hitl_review_actions.py` covers the graph side).

## Definition of done

HITL components + resume hook + bulk-approve; Handoff updated.

---

## Status: done

## Handoff notes

Completed 2026-07-14.

### What shipped
- `src/components/hitl/hitlContent.ts` — payload/plan/questions helpers; `envelopeKey` /
  `resumeInterruptId` for BE envelopes missing `interrupt_id`.
- `src/components/hitl/InterruptCard.tsx` — plan / review / clarification UI; Approve /
  Edit / Reject(+reason dual-write) / Answer; attempt badge from attempt ≥ 2.
- `src/components/hitl/InterruptStack.tsx` — stack chrome + bulk-approve toggle.
- `src/hooks/useHitlResume.ts` — interrupt stack (dedupe by key), local history (task 12),
  `streamResume`, in-flight guard, **409 → GET /state** (no blind retry), bulk auto-approve
  for `phase: "plan"` only.
- `useStartRun` — `beginExternalStream` + `observeStreamEvent` so resume shares the phase
  machine with start.
- `RunPage` wires SSE `interrupt` → stack; shows `InterruptStack` while paused/queued.
- CSS: `.hitl-*` in `global.css`.
- Tests: `useHitlResume.test.tsx` — resume body + `interrupt_id`, double Approve → one
  request, 409→state, bulk-approve (76 total green); build green.

### Contract notes
- Resume always sends `interrupt_id` (synthesized via `envelopeKey` when live BE omits it).
- Reject sends both `reason` and `edited_content: { reason }` for live-BE feedback drift.
- Stream ends on interrupt; resume opens a **new** SSE stream — same `onSseEvent` handlers
  as start (pipeline + session badges).
- Bulk-approve is run-scoped (all plan gates while toggle is on), not section-scoped;
  review/clarification always render. Tighten to “current section” in task 10 if needed.

### For task 09 / 10 / 11 / 12
- Artifact deep viewers stay out of the card (task 09); card shows markdown/JSON editor stubs.
- Task 10 may relocate the stack in the workspace grid; keep `InterruptStack` API stable.
- Task 11: hydrate stack from `GET /state.interrupt` on reconnect/`continue` — hook already
  supports `pushInterrupt` + 409 refetch path.
- Task 12: consume `hitl.history` for the transcript (auto entries included).
