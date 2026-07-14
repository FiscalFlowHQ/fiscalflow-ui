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
| `step` | `{ node: string, namespace: string[] }` | Pipeline rail. Inner nodes are `"{step}.{phase}"` (e.g. `draft.execute`) |
| `token` | `{ text: string, node: string, namespace: string[] }` JSON | Prose only — BE emits tokens solely for the streaming execute nodes; no JSON-blob noise |
| `interrupt` | `{ interrupt_id: string, ...InterruptEnvelope }` JSON | Pause. **The stream always ends here** — keep `interrupt_id`; resume needs it |
| `done` | `{}` | Terminal success |
| `error` | `{ message: string }` | Terminal failure (BE also records `run_status: "failed"`) |

## Interfaces exposed

```typescript
type SseEvent =
  | { type: "step"; node: string; namespace: string[] }
  | { type: "token"; text: string; node: string; namespace: string[] }
  | { type: "interrupt"; interruptId: string; envelope: InterruptEnvelope }
  | { type: "done" }
  | { type: "error"; message: string };

type SseHandlers = {
  onEvent: (ev: SseEvent) => void;
  onClose?: () => void;
};

// POST body as JSON; response body is text/event-stream.
// "continue" (recovery after a disconnect, task 11) takes no body.
streamGeneration(
  threadId: string,
  path: "start" | "resume" | "continue",
  body: StartGenerationRequest | ResumeRequest | undefined,
  handlers: SseHandlers,
  signal?: AbortSignal,
): Promise<void>
```

## Implementation notes

- Use `fetch` + `ReadableStream` reader (not `EventSource` — POST required). Parse
  `event:` / `data:` lines per SSE spec; buffer partial lines.
- Pass `Authorization` header from task 01 helper.
- On `interrupt`, **stop reading** — the BE has already closed the stream; caller shows
  HITL UI; the next call is `resume` (a NEW stream). There is no stream re-attach and no
  `Last-Event-ID` replay — reconnection is `POST /continue` (task 11).
- On HTTP **404/409/422**, throw `ApiError` before stream read (409 body says whether the
  thread is mid-execution, cancelled, or the `interrupt_id` was stale).
- Support `AbortSignal` for cancel (task 11) — abort fetch when user cancels. Note an
  abort/refresh mid-stream cancels the run server-side; recovery is `/continue`.
- Reference implementation: `fiscalflow-api/scripts/sse_client.py`.

## Verification

- Unit test: feed recorded SSE lines (from `sse_client.py` run) → correct `SseEvent[]`.
- Manual: log events to console from a dev button against live API + mocked LLM run.

## Integration check

Works with BE `POST /sessions/{id}/start` on a ready document (see BE task-09 manual).

## Definition of done

SSE parser + `streamGeneration`/`streamResume` helpers; tests; Handoff notes.

---

## Status: done

## Handoff notes

Completed 2026-07-14.

### What shipped
- `src/types/sse.ts` — `SseEvent`, `SseHandlers`, `GenerationStreamPath`, `isTerminalSseEvent`.
- `src/api/sse.ts` — line-buffered SSE parser + `streamGeneration` /
  `streamStart` / `streamResume` / `streamContinue`; `parseSseFixture` / `decodeSseEvent`
  for offline replay.
- Auth via `getAuthHeaders()`; non-2xx → `ApiError` via shared `ensureOk` (http.ts).
- Stops reading after terminal `interrupt` | `done` | `error` (interrupt always ends the
  stream; next interaction is a **new** `resume`/`continue` POST).
- `AbortSignal` supported (cancel / unmount).
- Tests: `src/api/sse.test.ts` — fixture replay, plain+JSON tokens, HTTP 409, abort.
- `npm test` 34 green; `npm run build` green.

### Token / interrupt tolerance (BE drift)
| Event | UI normalized shape | Live BE today |
|---|---|---|
| `token` | `{ text, node, namespace }` | **Plain string** in `data` (`streaming.py` yields `message.content`) |
| `interrupt` | envelope always has `interrupt_id` (may be `""`) | No `interrupt_id` on TypedDict yet |
| `continue` | `streamContinue()` wired | **Route missing** on live BE — task 11 blocked until BE adds it |

Parser accepts both token forms so task 07/10 work against live OR remediated BE.

### Usage for later tasks
```ts
await streamStart(threadId, body, {
  onEvent(ev) {
    if (ev.type === "step") { /* rail */ }
    if (ev.type === "token") { /* append ev.text */ }
    if (ev.type === "interrupt") { /* HITL: keep ev.interruptId + ev.envelope */ }
  },
});
// later:
await streamResume(threadId, { action: "approve", interrupt_id }, handlers);
```

No Last-Event-ID / stream re-attach. Mid-stream abort cancels the run server-side;
recovery is `POST .../continue` once BE ships it.

### Manual check
Drive with BE up + `scripts/sse_client.py` first, then call `streamStart` from a temporary
dev button / console against the same session flow.
