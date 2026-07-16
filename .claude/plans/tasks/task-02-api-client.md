# Task 02 — Types & REST API client

> **Context recap:** The UI is transport-only; all contracts mirror
> `fiscalflow-api/app/api/schemas.py` and §8.2. Read task 01 handoff for `config` +
> `getAuthHeaders`.

**Docs to read:** `fiscalflow-api/app/api/schemas.py`, `app/api/routers/*.py` (sessions,
documents, generation stubs).

## Goal

Typed TypeScript models and a thin `fetch` wrapper for every **non-streaming** backend
endpoint the UI needs.

## Dependencies: task 01.

## Scope

**In:** `src/types/api.ts`; `src/api/fiscalflow.ts` (new client alongside legacy
`src/api/client.ts`); `src/api/http.ts` (base request helper with auth + errors).

**Out:** SSE (task 03); React hooks (tasks 04+).

## Types to mirror (from BE)

```typescript
SessionResponse { thread_id }
DocumentUploadResponse { document_ref }
DocumentStatusResponse { status, audit_status?, error? }
StartGenerationRequest { selected_sections, document_ref?, instruction?, approval_policy?, provider_override? }
  // approval_policy: "thorough" | "balanced" (BE presets; UI defaults to "balanced")
ResumeRequest {
  action: "approve"|"edit"|"reject"|"answer",
  interrupt_id: string,                                  // REQUIRED — from the envelope
  edited_content?: Record<string, unknown> | unknown[] | string | null,
  reason?: string                                        // free text with "reject"
}
InstructionRequest { text: string }                       // POST /sessions/{id}/instruction
InterruptEnvelope {
  interrupt_id: string,
  tier: "global"|"section"|"step",
  phase: "plan"|"review"|"clarification",
  section_id, step_id,
  content: Record<string, unknown>,                       // review: { [output_key]: value, attempt: n }
  allowed_actions: ("approve"|"edit"|"reject"|"answer")[]
}
SectionCatalogResponse { sections: { id, title, order, required_structure }[] }  // GET /sections
SessionStateResponse { values, next: string[], interrupt: InterruptEnvelope | null, section_state: SectionState | null }
SessionStatusResponse { run_status, audit_status, current_section_index }
  // run_status: "ingesting"|"planning"|"awaiting_approval"|"generating"|"reviewing"|"assembling"|"completed"|"failed"|"cancelled"
CancelResponse { cancelled: boolean, was_running: boolean, run_status: "cancelled" }
ProviderSettingsResponse {
  provider: string | null, model: string | null,
  available_providers: { provider: string; default_model: string; key_present: boolean }[]
  // array of OBJECTS — not strings
}
RunError { message: string }                              // values.error shape
```

Document `status` union: `uploaded | auditing | ingesting | ready | failed`.

## Functions to expose

```typescript
// src/api/fiscalflow.ts
createSession(): Promise<SessionResponse>
listSections(): Promise<SectionCatalogResponse>
uploadDocument(threadId: string, file: File): Promise<DocumentUploadResponse>
getDocumentStatus(documentRef: string): Promise<DocumentStatusResponse>
getSessionState(threadId: string): Promise<SessionStateResponse>
getSessionStatus(threadId: string): Promise<SessionStatusResponse>
sendInstruction(threadId: string, text: string): Promise<{ ok: boolean; instruction_count: number }>
cancelRun(threadId: string): Promise<CancelResponse>
downloadDocument(threadId: string, format?: "md" | "pptx" | "pdf"): Promise<Blob>
getProviderSettings(): Promise<ProviderSettingsResponse>
setProviderSettings(body: { provider: string; model?: string }): Promise<{ provider: string; model?: string }>
checkHealth(): Promise<{ status: string }>
```

(`start`/`resume`/`continue` are SSE — task 03.)

## Implementation notes

- `uploadDocument`: `FormData` with `file` + `thread_id` (matches BE `documents.py`).
- Map `HTTP 400 / 404 / 409 / 413 / 422 / 503` to typed errors (`ApiError` with
  `status`, `detail`). 400 = validation (empty/unknown sections, blank instruction);
  409 = concurrency/stale-interrupt/cancelled; 413 = upload too large; 422 = body-shape
  (e.g. missing `interrupt_id`) or unknown `?format=`.
- Keep **legacy** `client.ts` untouched — but know it targets `/api/audits`, which no
  backend serves (see task 01 note).
- Base URL: prepend `config.apiBaseUrl` to paths like `/sessions`.

## Verification

- Unit tests with `msw` or mocked `fetch` for each function (happy + 404).
- Manual: call `createSession()` + `checkHealth()` from browser console or a dev button.

## Integration check

Task 01 routes still work; no regression on legacy audit client.

## Definition of done

Typed REST client complete and tested; Handoff lists any schema drift from BE.

---

## Status: done

## Handoff notes

Completed 2026-07-14.

### What shipped
- `src/types/api.ts` — typed models for sessions, documents, HITL, status, providers, catalog.
- `src/api/http.ts` — `requestJson` / `requestBlob` + `ApiError` (`status`, `detail`, `body`);
  bearer via task-01 `getAuthHeaders()` / `apiUrl()`; FastAPI string + validation-array `detail`.
- `src/api/fiscalflow.ts` — all non-SSE functions from the task brief.
- Legacy `src/api/client.ts` untouched.
- HomePage health probe now uses `checkHealth()` (no behavior change).
- MSW tests in `src/api/fiscalflow.test.ts` — happy + 404/400/409/413/422 paths.
- `npm test` 24+ green; `npm run build` green.

### Client normalizations
- `getSessionState`: defaults `section_state` to `null` when BE omits it.
- `cancelRun`: defaults `was_running` to `cancelled` when BE omits it.

### Schema drift vs live `fiscalflow-api` (tree as of 2026-07-14)

UI types follow the **UI plan / remediation contract**. Live BE still behind on several items —
treat as BE follow-ups, not UI bugs:

| Area | UI client / types | Live BE today |
|---|---|---|
| `GET /sections` | `listSections()` | **Missing** — catalog only in `app/domain/sections.yaml` + registry |
| `POST /sessions/{id}/instruction` | `sendInstruction()` | **Missing** |
| `ResumeRequest.interrupt_id` / `reason` | Declared on types (SSE task 03) | `schemas.ResumeRequest` has only `action` + `edited_content` |
| `InterruptEnvelope.interrupt_id` | Required on types | `hitl.InterruptEnvelope` has no `interrupt_id` |
| `GET .../state` → `section_state` | Normalized to `null` if absent | Not returned |
| `POST .../cancel` → `was_running` | Normalized | Omitted (`{ cancelled, run_status }` only) |
| Upload 413 / unknown-session 404 | Client maps status codes | Upload does not enforce size cap or session existence yet |
| `StartGenerationRequest.approval_policy` default | UI docs say composer default `"balanced"` | BE pydantic default `"thorough"` if omitted |

Known live catalog ids (from `sections.yaml`): `business_overview` (order 1),
`quality_of_earnings` (order 3).

### Next
- Task 03: SSE over `start` / `resume` / `continue` using these types + `ApiError`.
- Task 04+: import from `../api/fiscalflow` and `../types/api` only — do not call raw `fetch`
  for fiscalflow-api REST.
