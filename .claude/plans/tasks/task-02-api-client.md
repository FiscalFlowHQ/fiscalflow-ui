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
  // approval_policy: "thorough" | "balanced" (BE presets, default "thorough")
ResumeRequest { action: "approve"|"edit"|"reject"|"answer", edited_content?: dict }
InterruptEnvelope {
  tier: "global"|"section"|"step",
  phase: "plan"|"review"|"clarification",
  section_id, step_id, content: dict, allowed_actions: ("approve"|"edit"|"reject"|"answer")[]
}
ProviderSettingsResponse { provider, model, available_providers[] }
```

Document `status` union: `uploaded | auditing | ingesting | ready | failed`.

## Functions to expose

```typescript
// src/api/fiscalflow.ts
createSession(): Promise<SessionResponse>
uploadDocument(threadId: string, file: File): Promise<DocumentUploadResponse>
getDocumentStatus(documentRef: string): Promise<DocumentStatusResponse>
getSessionState(threadId: string): Promise<SessionStateResponse>
getSessionStatus(threadId: string): Promise<SessionStatusResponse>
cancelRun(threadId: string): Promise<{ cancelled: boolean; run_status: string }>
downloadDocument(threadId: string, format?: "md" | "pptx" | "pdf"): Promise<Blob>
getProviderSettings(): Promise<ProviderSettingsResponse>
setProviderSettings(body: { provider: string; model?: string }): Promise<{ provider: string; model?: string }>
checkHealth(): Promise<{ status: string }>
```

## Implementation notes

- `uploadDocument`: `FormData` with `file` + `thread_id` (matches BE `documents.py`).
- Map `HTTP 404` / `409` / `503` to typed errors (`ApiError` with `status`, `detail`).
- Keep **legacy** `client.ts` untouched — audit API is separate.
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
