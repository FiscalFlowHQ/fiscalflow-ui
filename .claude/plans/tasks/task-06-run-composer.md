# Task 06 — Run composer

> **Context recap:** Starting a run sends `StartGenerationRequest` to `POST /sessions/{id}/start`
> (SSE). User picks sections, optional instruction, and approval policy before streaming begins.

**Docs to read:** `plans/BACKEND_CONTRACT.md` (section catalog, provider preflight),
`fiscalflow-api/app/domain/sections.yaml`.

## Goal

**Composer card**: section checkboxes (ordered), instruction, approval policy, provider
readiness gate, and **Start generation** — disabled until databook is `ready` **and** LLM
provider key is present on the server.

## Dependencies: task 02, task 04, task 05.

## Scope

**In:** `src/components/run/RunComposer.tsx`; `src/config/sections.ts`; `src/hooks/useProviderReadiness.ts`;
`useStartRun` wiring (delegates SSE to parent).

**Out:** Pipeline rail (task 07); Settings page UI (task 13) — but preflight uses same API.

## StartGenerationRequest fields

```typescript
{
  selected_sections: string[];      // min 1; sorted by catalog order when sent
  document_ref?: string;
  instruction?: string;
  approval_policy?: "thorough" | "balanced";
  provider_override?: string | null;  // optional per-run override (advanced)
}
```

## Section catalog (`src/config/sections.ts`)

Copy from `fiscalflow-api/app/domain/sections.yaml` at implementation time:

| id | title | order |
|---|---|---|
| `business_overview` | Business Overview | 1 |
| `quality_of_earnings` | Quality of Earnings | 3 |

- Sort UI by `order`; default selection: `["quality_of_earnings"]` only (faster MVP test).
- Ids must match BE exactly — unknown id → 400 on start.
- Add comment: re-sync when BE adds sections.

## Provider preflight (required)

On mount + when Settings may have changed:

1. `getProviderSettings()` from task 02.
2. `isProviderReady(settings)` → false if no provider or `key_present === false`.
3. Show inline warning: "No LLM API key on server for {provider}. Set env var on API host or
   pick another provider in Settings." Link to `/settings`.
4. **Disable Start** when not ready (upload/ingest still works).

## UI elements

- Section checkboxes + short descriptions from yaml `title`.
- Instruction textarea.
- Policy: **Thorough** vs **Balanced** (default `thorough`).
- Start button + disabled reason tooltip (document not ready | provider not ready).

## Implementation notes

- Pass `document_ref` from ingestion hook / local session.
- HTTP 409 on start → toast (task 11).
- HTTP 400 → show `detail` (bad section, empty list).

## Verification

- Start disabled without ready document.
- Start disabled when `key_present: false` for active provider.
- With fixture + configured Z.ai key: Start opens SSE.

## Integration check

BE rejects empty `selected_sections` with 400.

## Definition of done

Composer + catalog + provider gate; Handoff updated.

---

## Status: todo

## Handoff notes

_(fill at completion)_
