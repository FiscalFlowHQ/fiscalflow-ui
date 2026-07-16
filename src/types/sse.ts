import type { InterruptEnvelope, ResumeAction } from "./api";

/**
 * Normalized SSE events from fiscalflow-api generation streams
 * (`POST /sessions/{id}/start|resume|continue`).
 */
export type SseEvent =
  | { type: "step"; node: string; namespace: string[] }
  | { type: "token"; text: string; node: string; namespace: string[] }
  | { type: "interrupt"; interruptId: string; envelope: InterruptEnvelope }
  | { type: "done" }
  | { type: "error"; message: string };

export type SseHandlers = {
  onEvent: (ev: SseEvent) => void;
  onClose?: () => void;
  /** Fired after HTTP 200 and before the first SSE event (stream actually accepted). */
  onOpen?: () => void;
};

export type GenerationStreamPath = "start" | "resume" | "continue";

/** Events that end the SSE stream for the client (BE closes after interrupt/done/error). */
export function isTerminalSseEvent(ev: SseEvent): boolean {
  return ev.type === "interrupt" || ev.type === "done" || ev.type === "error";
}

export type { ResumeAction };
