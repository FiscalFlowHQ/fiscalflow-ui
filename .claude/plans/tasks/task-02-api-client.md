# Task 02 — Types & REST API client

> **Context recap:** The UI is transport-only; all contracts mirror
> `fiscalflow-api/app/api/schemas.py` and §8.2. Read task 01 handoff for `config` +
> `getAuthHeaders`. Full field reference: `plans/BACKEND_CONTRACT.md`.

**Docs to read:** `fiscalflow-api/app/api/schemas.py`, `app/graph/state.py`,
`app/api/routers/*.py`, `plans/BACKEND_CONTRACT.md`.

## Goal

Typed TypeScript models and a thin `fetch` wrapper for every **non-streaming** backend
endpoint the UI needs — including partial `ReportState` for reconnect/export.

## Dependencies: task 01.

## Scope

**In:** `src/types/api.ts`; `src/types/report-state.ts`; `src/api/fiscalflow.ts`;
`src/api/http.ts` (base request + `ApiError`); Vitest + MSW setup (minimal).

**Out:** SSE (task 03); React hooks (tasks 04+).

## Types to mirror (from BE)

```typescript
// --- API envelopes ---
SessionResponse { thread_id: string }
DocumentUploadResponse { document_ref: string }
DocumentStatusResponse { status: DocumentStatus; audit_status?: string; error?: string }
DocumentStatus = "uploaded" | "auditing" | "ingesting" | "ready" | "failed"

StartGenerationRequest {
  selected_sections: string[];
  document_ref?: string | null;
  instruction?: string | null;
  approval_policy?: "thorough" | "balanced";  // default "thorough"
  provider_override?: string | null;
}
ResumeRequest {
  action: "approve" | "edit" | "reject" | "answer";
  edited_content?: Record<string, unknown> | null;
}
InterruptEnvelope { tier, phase, section_id, step_id, content, allowed_actions }  // see BACKEND_CONTRACT

SessionStateResponse {
  values: Partial<ReportState>;
  next: string[];
  interrupt: InterruptEnvelope | null;
}
SessionStatusResponse {
  run_status: RunStatus | null;
  audit_status: string | null;
  current_section_index: number | null;
}

ProviderSettingsResponse {
  provider: string | null;
  model: string | null;
  available_providers: Array<{
    provider: string;
    default_model: string | null;
    key_present: boolean;
  }>;
}

// --- Report state (partial; see report-state.ts) ---
RunStatus =
  | "ingesting" | "planning" | "awaiting_approval" | "generating"
  | "reviewing" | "assembling" | "completed" | "failed" | "cancelled";

CompletedSection { id, title?, order?, draft?, claims?, quality_verdict? }
ReportState { databook_ref, completed_sections, run_status, error, metadata, final_document, ... }
```

## Functions to expose

```typescript
createSession(): Promise<SessionResponse>
uploadDocument(threadId: string, file: File): Promise<DocumentUploadResponse>
getDocumentStatus(documentRef: string): Promise<DocumentStatusResponse>
getSessionState(threadId: string): Promise<SessionStateResponse>
getSessionStatus(threadId: string): Promise<SessionStatusResponse>
cancelRun(threadId: string): Promise<{ cancelled: boolean; run_status: string }>
downloadDocument(threadId: string, format?: "md" | "pptx" | "pdf"): Promise<Blob>
getProviderSettings(): Promise<ProviderSettingsResponse>
setProviderSettings(body: { provider: string; model?: string }): Promise<{ provider: string; model?: string | null }>
checkHealth(): Promise<{ status: string }>

// helpers
export function isProviderReady(settings: ProviderSettingsResponse): boolean
export function formatApiError(err: ApiError): string
```

## Implementation notes

- `uploadDocument`: `FormData` with `file` + `thread_id` (matches BE `documents.py`).
- `ApiError`: `{ status: number; detail: string }` for 400, 401, 404, 409, 422, 503.
- `downloadDocument`: `response.blob()`; check `Content-Disposition` for filename optional.
- `isProviderReady`: true when stored `provider` has `key_present` in `available_providers`
  (used by task-06 Start gate — does not require Settings page to exist).
- Keep **legacy** `client.ts` untouched — audit API is separate.
- Base URL: prepend `config.apiBaseUrl` to paths like `/sessions`.
- Add `src/test/setup.ts` + Vitest config if not present (task-01 may have stubbed).

## Verification

- Unit tests with MSW: happy path + 401 + 404 + 409 for session/state/download.
- `isProviderReady` tests with mocked provider list.
- Manual: `createSession()` + `checkHealth()` from dev console.

## Integration check

Task 01 routes still work; no regression on legacy audit client.

## Definition of done

Typed REST client + `ReportState` partial types + tests; Handoff lists any schema drift.

---

## Status: todo

## Handoff notes

_(fill at completion)_
