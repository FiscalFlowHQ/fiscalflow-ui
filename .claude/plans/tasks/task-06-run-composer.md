# Task 06 — Run composer

> **Context recap:** Starting a run sends `StartGenerationRequest` to `POST /sessions/{id}/start`
> (SSE). User picks sections, optional instruction, and approval policy before streaming begins.

**Docs to read:** `plans/UI_FLOW.md` (Phase C), BE `sections.yaml` (MVP: `quality_of_earnings`).

## Goal

**Composer card** on the run screen: section checkboxes, instruction textarea, approval
policy, and **Start generation** — disabled until databook is `ready`.

## Dependencies: task 04, task 05.

## Scope

**In:** `src/components/run/RunComposer.tsx`; `src/config/sections.ts` (static catalog
mirroring BE); integration hook `useStartRun` (calls task 03 SSE — can stub handlers until task 07).

**Out:** Pipeline rail rendering (task 07); full workspace (task 10).

## StartGenerationRequest fields

```typescript
{
  selected_sections: string[];      // min 1; MVP default ["quality_of_earnings"]
  document_ref?: string;            // required in practice — from task 05
  instruction?: string;             // optional user guidance
  approval_policy?: "thorough" | "balanced";   // BE presets (§6.6); default "thorough"
  provider_override?: string | null; // defer UI to task 13
}
```

## UI elements

- Section list with descriptions (from `sections.yaml` copy).
- Instruction: multiline, placeholder "Focus on revenue normalization…".
- Policy: radio group — **Thorough** (more HITL) vs **Balanced**; default `thorough`.
- Load section catalog from `fiscalflow-api/app/domain/sections.yaml` — MVP has
  `quality_of_earnings` + `business_overview` (both live on BE).
- **Start** button: calls `streamGeneration(id, "start", body, handlers)`.
- After start: composer collapses or locks; show "Running…" (task 07 takes over).

## Implementation notes

- Validate at least one section selected.
- Pass `document_ref` from `useDocumentIngestion` / local session.
- On HTTP 409 (run already active): show toast + link to reconnect (task 11).
- Do not duplicate SSE handling here — delegate to parent `RunPage` state.

## Verification

- Start disabled when document not ready.
- With ready document + API key configured: Start opens SSE stream (console log events).
- Section catalog matches BE `quality_of_earnings` id exactly.

## Integration check

BE rejects empty `selected_sections` with 422.

## Definition of done

Composer UI + start wiring; Handoff updated.

---

## Status: todo

## Handoff notes

_(fill at completion)_
