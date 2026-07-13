# Task 03 — SSE streaming client

> **Context recap:** Generation is driven by Server-Sent Events on `start` and `resume`.
> Mirror `fiscalflow-api/app/api/streaming.py` and `scripts/sse_client.py`.

**Docs to read:** BE task-08 handoff, `plans/BACKEND_CONTRACT.md`.

## Goal

Reusable **SSE consumer** for the stable event vocabulary — POST + stream reader.

## Dependencies: task 02.

## Scope

**In:** `src/api/sse.ts`; `src/types/sse.ts`; `src/api/sse.test.ts` with fixture lines.

**Out:** UI components (task 07+).

## Event vocabulary

| `event` | `data` | Notes |
|---|---|---|
| `step` | JSON `{ node, namespace }` | `namespace` is `string[]` |
| `token` | **Plain text** (not JSON) | Prose only |
| `interrupt` | JSON `InterruptEnvelope` | Stream ends after this |
| `done` | `{}` | Terminal success |
| `error` | JSON `{ message }` | Terminal failure |

## Interfaces

```typescript
streamGeneration(
  threadId: string,
  path: "start" | "resume",
  body: StartGenerationRequest | ResumeRequest,
  handlers: SseHandlers,
  signal?: AbortSignal,
): Promise<void>
```

## Implementation notes

- `fetch` + `ReadableStream`; parse `event:` / `data:` lines; buffer partial lines.
- `Authorization` header from task 01.
- On `interrupt`: stop reading; caller shows HITL; next call is `resume`.
- HTTP **409** on both `start` and `resume` → throw `ApiError` before read.
- HTTP **401** → throw with auth hint.
- `AbortSignal` for cancel (task 11).
- `token` data: use raw string after `data:` trim — do not `JSON.parse` unless starts with `{`.

## Verification

- Unit test: fixture lines from `sse_client.py` run → `SseEvent[]`.
- Test: plain-text token line without JSON quotes.

## Definition of done

SSE parser + tests; Handoff notes.

---

## Status: todo

## Handoff notes

_(fill at completion)_
