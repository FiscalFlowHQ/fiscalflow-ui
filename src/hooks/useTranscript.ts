import { useCallback, useEffect, useRef, useState } from "react";
import { envelopeKey } from "../components/hitl/hitlContent";
import type { InterruptEnvelope, ResumeRequest } from "../types/api";
import type { SseEvent } from "../types/sse";

export type TranscriptEntry =
  | { id: string; kind: "system"; text: string; at: string }
  | { id: string; kind: "step"; node: string; at: string }
  | { id: string; kind: "assistant"; text: string; node: string; at: string }
  | { id: string; kind: "interrupt"; envelope: InterruptEnvelope; at: string }
  | {
      id: string;
      kind: "decision";
      action: ResumeRequest["action"];
      interruptId: string;
      reason?: string;
      auto?: boolean;
      at: string;
    }
  | { id: string; kind: "instruction"; text: string; at: string }
  | { id: string; kind: "error"; message: string; at: string };

export type UseTranscriptResult = {
  entries: TranscriptEntry[];
  applyEvent: (ev: SseEvent) => void;
  logSystem: (text: string) => void;
  logInstruction: (text: string) => void;
  logDecision: (input: {
    action: ResumeRequest["action"];
    interruptId: string;
    reason?: string;
    auto?: boolean;
  }) => void;
  /** Clear before a new Start; returns false if the user cancelled. */
  clearForNewRun: (opts?: { confirm?: boolean }) => boolean;
  exportPlainText: () => string;
  reset: () => void;
};

const STORAGE_PREFIX = "fiscalflow.transcript.v1.";

let entrySeq = 0;

function nowIso(): string {
  return new Date().toISOString();
}

function nextId(kind: string): string {
  return `${kind}-${++entrySeq}-${Date.now().toString(36)}`;
}

function storageKey(threadId: string): string {
  return `${STORAGE_PREFIX}${threadId}`;
}

function loadStored(threadId: string): TranscriptEntry[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(storageKey(threadId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TranscriptEntry[]) : [];
  } catch {
    return [];
  }
}

function saveStored(threadId: string, entries: TranscriptEntry[]): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(threadId), JSON.stringify(entries));
  } catch {
    /* quota / private mode */
  }
}

export function exportTranscriptPlainText(entries: TranscriptEntry[]): string {
  return entries
    .map((e) => {
      const t = e.at;
      switch (e.kind) {
        case "system":
          return `[${t}] system: ${e.text}`;
        case "step":
          return `[${t}] step: ${e.node}`;
        case "assistant":
          return `[${t}] assistant (${e.node}):\n${e.text}`;
        case "interrupt":
          return `[${t}] interrupt: ${e.envelope.phase}/${e.envelope.tier} ${e.envelope.interrupt_id || envelopeKey(e.envelope)}`;
        case "decision":
          return `[${t}] decision: ${e.action}${e.auto ? " (auto)" : ""}${e.reason ? ` — ${e.reason}` : ""} [${e.interruptId}]`;
        case "instruction":
          return `[${t}] instruction: ${e.text}`;
        case "error":
          return `[${t}] error: ${e.message}`;
        default:
          return `[${t}]`;
      }
    })
    .join("\n\n");
}

export function useTranscript(threadId: string): UseTranscriptResult {
  const [entries, setEntries] = useState<TranscriptEntry[]>(() =>
    threadId ? loadStored(threadId) : []
  );
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  useEffect(() => {
    setEntries(loadStored(threadId));
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return;
    saveStored(threadId, entries);
  }, [threadId, entries]);

  const applyEvent = useCallback((ev: SseEvent) => {
    if (ev.type === "token") {
      const node = ev.node || "prose";
      setEntries((prev) => {
        const last = prev[prev.length - 1];
        if (last?.kind === "assistant" && last.node === node) {
          const next = prev.slice(0, -1);
          next.push({ ...last, text: last.text + ev.text });
          return next;
        }
        return [
          ...prev,
          {
            id: nextId("assistant"),
            kind: "assistant",
            text: ev.text,
            node,
            at: nowIso(),
          },
        ];
      });
      return;
    }

    if (ev.type === "step") {
      setEntries((prev) => [
        ...prev,
        {
          id: nextId("step"),
          kind: "step",
          node: ev.node || "(unnamed)",
          at: nowIso(),
        },
      ]);
      return;
    }

    if (ev.type === "interrupt") {
      setEntries((prev) => {
        const key =
          ev.envelope.interrupt_id || envelopeKey(ev.envelope);
        if (
          prev.some(
            (e) =>
              e.kind === "interrupt" &&
              (e.envelope.interrupt_id || envelopeKey(e.envelope)) === key
          )
        ) {
          return prev;
        }
        return [
          ...prev,
          {
            id: nextId("interrupt"),
            kind: "interrupt",
            envelope: ev.envelope,
            at: nowIso(),
          },
        ];
      });
      return;
    }

    if (ev.type === "error") {
      setEntries((prev) => [
        ...prev,
        {
          id: nextId("error"),
          kind: "error",
          message: ev.message,
          at: nowIso(),
        },
      ]);
      return;
    }

    if (ev.type === "done") {
      setEntries((prev) => [
        ...prev,
        {
          id: nextId("system"),
          kind: "system",
          text: "Run completed.",
          at: nowIso(),
        },
      ]);
    }
  }, []);

  const logSystem = useCallback((text: string) => {
    setEntries((prev) => {
      // Databook ready was spamming on every remount/poll — collapse duplicates.
      if (
        text.startsWith("Databook ready") &&
        prev.slice(-20).some((e) => e.kind === "system" && e.text === text)
      ) {
        return prev;
      }
      // Collapse identical recovery / decision system lines within the recent window.
      const recovery =
        text.includes("continuing from") ||
        text.includes("Continuing from") ||
        text.startsWith("Decision submitted") ||
        text.startsWith("Generation stopped mid-step") ||
        text.startsWith("No pause left to approve");
      if (
        recovery &&
        prev.slice(-8).some((e) => e.kind === "system" && e.text === text)
      ) {
        return prev;
      }
      return [
        ...prev,
        { id: nextId("system"), kind: "system", text, at: nowIso() },
      ];
    });
  }, []);

  const logInstruction = useCallback((text: string) => {
    setEntries((prev) => [
      ...prev,
      { id: nextId("instruction"), kind: "instruction", text, at: nowIso() },
    ]);
  }, []);

  const logDecision = useCallback(
    (input: {
      action: ResumeRequest["action"];
      interruptId: string;
      reason?: string;
      auto?: boolean;
    }) => {
      setEntries((prev) => {
        if (
          prev.some(
            (e) =>
              e.kind === "decision" &&
              e.interruptId === input.interruptId &&
              e.action === input.action &&
              Boolean(e.auto) === Boolean(input.auto)
          )
        ) {
          return prev;
        }
        return [
          ...prev,
          {
            id: nextId("decision"),
            kind: "decision",
            action: input.action,
            interruptId: input.interruptId,
            reason: input.reason,
            auto: input.auto,
            at: nowIso(),
          },
        ];
      });
    },
    []
  );

  const clearForNewRun = useCallback(
    (opts?: { confirm?: boolean }) => {
      if (opts?.confirm !== false && entriesRef.current.length > 0) {
        const ok = window.confirm(
          "Clear the chat transcript for this new run? Prior messages for this thread will be removed."
        );
        if (!ok) return false;
      }
      setEntries([]);
      saveStored(threadId, []);
      return true;
    },
    [threadId]
  );

  const reset = useCallback(() => {
    setEntries(loadStored(threadId));
  }, [threadId]);

  const exportPlainText = useCallback(() => {
    return exportTranscriptPlainText(entriesRef.current);
  }, []);

  return {
    entries,
    applyEvent,
    logSystem,
    logInstruction,
    logDecision,
    clearForNewRun,
    exportPlainText,
    reset,
  };
}
