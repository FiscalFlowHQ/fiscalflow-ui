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

## Status: todo

## Handoff notes

_(fill at completion)_
