/**
 * SSE consumer for fiscalflow-api generation streams.
 * Uses fetch + ReadableStream (POST required — not EventSource).
 */

import { apiUrl, getAuthHeaders } from "../config/env";
import { ensureOk } from "./http";
import type {
  InterruptEnvelope,
  ResumeAction,
  ResumeRequest,
  StartGenerationRequest,
} from "../types/api";
import type { GenerationStreamPath, SseEvent, SseHandlers } from "../types/sse";
import { isTerminalSseEvent } from "../types/sse";

const ACTIONS: ResumeAction[] = ["approve", "edit", "reject", "answer"];

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v));
}

function normalizeEnvelope(raw: Record<string, unknown>): InterruptEnvelope {
  const allowed = Array.isArray(raw.allowed_actions)
    ? (raw.allowed_actions.filter((a): a is ResumeAction =>
        ACTIONS.includes(a as ResumeAction)
      ) as ResumeAction[])
    : [];

  const interruptId =
    typeof raw.interrupt_id === "string" && raw.interrupt_id
      ? raw.interrupt_id
      : "";

  return {
    interrupt_id: interruptId,
    tier: (raw.tier as InterruptEnvelope["tier"]) ?? "step",
    phase: (raw.phase as InterruptEnvelope["phase"]) ?? "review",
    section_id: (raw.section_id as string | null) ?? null,
    step_id: (raw.step_id as string | null) ?? null,
    content:
      raw.content && typeof raw.content === "object" && !Array.isArray(raw.content)
        ? (raw.content as Record<string, unknown>)
        : {},
    allowed_actions: allowed,
  };
}

/**
 * Decode one SSE `event` + `data` pair into a typed {@link SseEvent}.
 * Tolerates live BE drift: plain-text `token` data; interrupt without `interrupt_id`.
 */
export function decodeSseEvent(eventName: string, data: string): SseEvent | null {
  const name = eventName || "message";

  try {
    switch (name) {
      case "step": {
        const parsed = JSON.parse(data) as { node?: unknown; namespace?: unknown };
        return {
          type: "step",
          node: String(parsed.node ?? ""),
          namespace: asStringArray(parsed.namespace),
        };
      }
      case "token": {
        // Target contract: JSON `{ text, node, namespace }`.
        // Live BE (streaming.py): plain prose string in `data`.
        try {
          const parsed = JSON.parse(data) as {
            text?: unknown;
            node?: unknown;
            namespace?: unknown;
          };
          if (parsed && typeof parsed === "object" && "text" in parsed) {
            return {
              type: "token",
              text: String(parsed.text ?? ""),
              node: String(parsed.node ?? ""),
              namespace: asStringArray(parsed.namespace),
            };
          }
        } catch {
          /* plain text */
        }
        return { type: "token", text: data, node: "", namespace: [] };
      }
      case "interrupt": {
        const raw = JSON.parse(data) as Record<string, unknown>;
        const envelope = normalizeEnvelope(raw);
        return {
          type: "interrupt",
          interruptId: envelope.interrupt_id,
          envelope,
        };
      }
      case "done":
        return { type: "done" };
      case "error": {
        try {
          const parsed = JSON.parse(data) as { message?: unknown };
          const message =
            parsed.message != null
              ? String(parsed.message)
              : data || "Unknown stream error";
          return { type: "error", message };
        } catch {
          return { type: "error", message: data || "Unknown stream error" };
        }
      }
      default:
        return null;
    }
  } catch {
    if (name === "error") return { type: "error", message: data || "Unknown stream error" };
    return null;
  }
}

/** Incremental SSE line buffer — feeds complete `event`/`data` blocks to `onBlock`. */
export class SseLineParser {
  private buffer = "";
  private eventName = "";
  private dataLines: string[] = [];

  constructor(private readonly onBlock: (eventName: string, data: string) => boolean | void) {}

  push(chunk: string): void {
    this.buffer += chunk;
    // Normalize CRLF → LF while preserving a trailing CR that might be split across chunks.
    this.buffer = this.buffer.replace(/\r\n/g, "\n");
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      if (!this.handleLine(line)) return;
    }
  }

  /** Flush a final incomplete event if the stream ended without a trailing blank line. */
  flush(): void {
    if (this.buffer.length > 0) {
      this.handleLine(this.buffer);
      this.buffer = "";
    }
    this.dispatchIfReady(true);
  }

  private handleLine(line: string): boolean {
    if (line.endsWith("\r")) line = line.slice(0, -1);

    if (line === "") {
      return this.dispatchIfReady(false);
    }

    if (line.startsWith(":")) {
      return true; // comment / keepalive
    }

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") {
      this.eventName = value;
    } else if (field === "data") {
      this.dataLines.push(value);
    }
    // id: / retry: ignored — BE has no Last-Event-ID replay
    return true;
  }

  private dispatchIfReady(force: boolean): boolean {
    if (this.dataLines.length === 0 && !this.eventName) {
      return true;
    }
    if (!force && this.dataLines.length === 0) {
      this.eventName = "";
      return true;
    }
    const data = this.dataLines.join("\n");
    const eventName = this.eventName;
    this.eventName = "";
    this.dataLines = [];
    const cont = this.onBlock(eventName, data);
    return cont !== false;
  }
}

/**
 * Parse a complete SSE text fixture into typed events (unit tests / offline replay).
 * Stops after the first terminal event (`interrupt` | `done` | `error`).
 */
export function parseSseFixture(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  const parser = new SseLineParser((eventName, data) => {
    const ev = decodeSseEvent(eventName, data);
    if (!ev) return true;
    events.push(ev);
    return !isTerminalSseEvent(ev);
  });
  parser.push(text);
  parser.flush();
  return events;
}

export type StreamGenerationBody = StartGenerationRequest | ResumeRequest | undefined;

/**
 * POST a generation stream and invoke handlers for each SSE event.
 * Resolves when the stream ends or a terminal event is received.
 * Throws {@link ApiError} on HTTP 404/409/422/etc. before reading the body.
 */
export async function streamGeneration(
  threadId: string,
  path: GenerationStreamPath,
  body: StreamGenerationBody,
  handlers: SseHandlers,
  signal?: AbortSignal
): Promise<void> {
  const headers = new Headers(getAuthHeaders());
  headers.set("Accept", "text/event-stream");
  const hasBody = body !== undefined;
  if (hasBody) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(apiUrl(`/sessions/${encodeURIComponent(threadId)}/${path}`), {
    method: "POST",
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
    signal,
  });
  await ensureOk(res);

  if (!res.body) {
    handlers.onClose?.();
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let stop = false;

  const parser = new SseLineParser((eventName, data) => {
    const ev = decodeSseEvent(eventName, data);
    if (!ev) return true;
    handlers.onEvent(ev);
    if (isTerminalSseEvent(ev)) {
      stop = true;
      return false;
    }
    return true;
  });

  try {
    while (!stop) {
      const { done, value } = await reader.read();
      if (done) {
        parser.push(decoder.decode());
        parser.flush();
        break;
      }
      parser.push(decoder.decode(value, { stream: true }));
      if (stop) break;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
    handlers.onClose?.();
  }
}

export function streamStart(
  threadId: string,
  body: StartGenerationRequest,
  handlers: SseHandlers,
  signal?: AbortSignal
): Promise<void> {
  return streamGeneration(threadId, "start", body, handlers, signal);
}

export function streamResume(
  threadId: string,
  body: ResumeRequest,
  handlers: SseHandlers,
  signal?: AbortSignal
): Promise<void> {
  return streamGeneration(threadId, "resume", body, handlers, signal);
}

/** Recovery after disconnect/refresh — no body; re-drives checkpoint (task 11). */
export function streamContinue(
  threadId: string,
  handlers: SseHandlers,
  signal?: AbortSignal
): Promise<void> {
  return streamGeneration(threadId, "continue", undefined, handlers, signal);
}
