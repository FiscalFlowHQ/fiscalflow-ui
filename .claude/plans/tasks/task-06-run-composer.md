# Task 06 — Run composer

> **Context recap:** Starting a run sends `StartGenerationRequest` to `POST /sessions/{id}/start`
> (SSE). User picks sections, optional instruction, and approval policy before streaming begins.
>
> **Updated after the BE remediation:** the catalog comes from `GET /sections` (no more
> hardcoded mirror), the default policy is **balanced** (user decision), and the empty-
> sections rejection is a 400.

**Docs to read:** `plans/UI_FLOW.md` (Phase C), BE `GET /sections`.

## Goal

**Composer card** on the run screen: section checkboxes, instruction textarea, approval
policy, and **Start generation** — disabled until databook is `ready`.

## Dependencies: task 04, task 05.

## Scope

**In:** `src/components/run/RunComposer.tsx`; `src/hooks/useSectionCatalog.ts` (fetches
`GET /sections`); integration hook `useStartRun` (calls task 03 SSE — can stub handlers
until task 07).

**Out:** Pipeline rail rendering (task 07); full workspace (task 10).

## Section catalog — `GET /sections`

```typescript
{ sections: { id: string; title: string; order: number | null; required_structure: string[] }[] }
```

Live catalog today: `business_overview` (order 1) + `quality_of_earnings` (order 3).
`order` values are **sparse by design** (they track the staged DD-Agent chapter numbers) —
sort by `order`, never assume continuity.

## StartGenerationRequest fields

```typescript
{
  selected_sections: string[];      // min 1 — BE rejects empty with HTTP 400 (not 422)
  document_ref?: string;            // required in practice — from task 05
  instruction?: string;             // optional user guidance (seeds instruction_history)
  approval_policy?: "thorough" | "balanced";   // BE presets (§6.6); UI default "balanced"
  provider_override?: string | null; // per-run provider select — build it here (small
                                     // dropdown fed by GET /settings/providers, task 13
                                     // owns the settings screen) or drop the field
}
```

## UI elements

- Section list with titles/descriptions from `GET /sections`.
- Instruction: multiline, placeholder "Focus on revenue normalization…".
- Policy: radio group, **default `balanced`**, with honest pause-cost copy so the choice
  is informed:
  - **Balanced** — ~5 approvals per section (the load-bearing gates only).
  - **Thorough** — ~16 approvals per section (every step's plan + review), plus the
    global gate; pair with task 08's bulk-approve. Power-user mode.
- **Start** button: calls `streamGeneration(id, "start", body, handlers)`.
- After start: composer collapses or locks; show "Running…" (task 07 takes over).

## Implementation notes

- Validate at least one section selected client-side too.
- Pass `document_ref` from `useDocumentIngestion` / local session.
- On HTTP 409 (run already active): show toast + recover via task 11 flow.
- Do not duplicate SSE handling here — delegate to parent `RunPage` state.

## Verification

- Start disabled when document not ready.
- With ready document + API key configured: Start opens SSE stream (console log events).
- Section catalog renders exactly what `GET /sections` returns (no hardcoded ids).

## Integration check

BE rejects empty `selected_sections` with **400**; unknown section id → 400.

## Definition of done

Composer UI + catalog hook + start wiring; Handoff updated.

---

## Status: todo

## Handoff notes

_(fill at completion)_
