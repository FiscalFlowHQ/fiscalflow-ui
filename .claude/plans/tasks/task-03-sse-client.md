# Task 03 — SSE streaming client

> **Context recap:** Generation is driven by Server-Sent Events on `start` and `resume`.
> Mirror `fiscalflow-api/app/api/streaming.py` and `scripts/sse_client.py`.

**Docs to read:** BE task-08 handoff (event vocabulary, `subgraphs=True` namespaces).

## Goal

A reusable **SSE consumer** that parses the stable event vocabulary and invokes callbacks —
usable from `RunPage` for both start and resume.

## Dependencies: task 02 (auth headers, types).

## Scope

**In:** `src/api/sse.ts`; `src/types/sse.ts`; optional `src/api/sse.test.ts` with fixture
event lines.

**Out:** UI components (task 07+); run orchestration (task 10).

## Event vocabulary (must handle)

| `event` | `data` shape | Notes |
|---|---|---|
| `step` | `{ node: string, namespace: string[] }` | Pipeline rail |
| `token` | raw string (JSON string or plain text) | Prose streaming |
| `interrupt` | `InterruptEnvelope` JSON | Pause run |
| `done` | `{}` | Terminal success |
| `error` | `{ message: string }` | Terminal failure |

## Interfaces exposed

```typescript
type SseEvent =
  | { type: "step"; node: string; namespace: string[] }
  | { type: "token"; text: string }
  | { type: "interrupt"; envelope: InterruptEnvelope }
  | { type: "done" }
  | { type: "error"; message: string };

type SseHandlers = {
  onEvent: (ev: SseEvent) => void;
  onClose?: () => void;
};

// POST body as JSON; response body is text/event-stream
streamGeneration(
  threadId: string,
  path: "start" | "resume",
  body: StartGenerationRequest | ResumeRequest,
  handlers: SseHandlers,
  signal?: AbortSignal,
): Promise<void>
```

## Implementation notes

- Use `fetch` + `ReadableStream` reader (not `EventSource` — POST required). Parse
  `event:` / `data:` lines per SSE spec; buffer partial lines.
- Pass `Authorization` header from task 01 helper.
- On `interrupt`, **stop reading** — caller shows HITL UI; next call is `resume`.
- On HTTP **409**, throw `ApiError` before stream read.
- Support `AbortSignal` for cancel (task 11) — abort fetch when user cancels.
- Reference implementation: `fiscalflow-api/scripts/sse_client.py`.

## Verification

- Unit test: feed recorded SSE lines (from `sse_client.py` run) → correct `SseEvent[]`.
- Manual: log events to console from a dev button against live API + mocked LLM run.

## Integration check

Works with BE `POST /sessions/{id}/start` on a ready document (see BE task-09 manual).

## Definition of done

SSE parser + `streamGeneration`/`streamResume` helpers; tests; Handoff notes.

---

## Status: todo

## Handoff notes

_(fill at completion)_
