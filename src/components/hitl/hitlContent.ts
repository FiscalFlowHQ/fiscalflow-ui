import type { InterruptEnvelope, ResumeAction } from "../../types/api";
import { INNER_LABELS } from "../pipeline/pipelineModel";

/** Stable key for dedupe / resume when BE omits `interrupt_id`. */
export function envelopeKey(envelope: InterruptEnvelope): string {
  if (envelope.interrupt_id) return envelope.interrupt_id;
  return [
    envelope.tier,
    envelope.phase,
    envelope.section_id ?? "",
    envelope.step_id ?? "",
    JSON.stringify(envelope.content)?.slice(0, 120) ?? "",
  ].join("|");
}

export function resumeInterruptId(envelope: InterruptEnvelope): string {
  return envelope.interrupt_id || envelopeKey(envelope);
}

const META_KEYS = new Set(["attempt"]);

const PREFERRED_OUTPUT_KEYS = [
  "draft",
  "evidence_bundle",
  "structured_outline",
  "claims",
  "quality_verdict",
  "global_plan",
  "active_section_plan",
  "step_plan",
  "content",
] as const;

export type ReviewPayload = {
  outputKey: string | null;
  value: unknown;
  attempt: number | null;
};

export function getAttempt(content: Record<string, unknown>): number | null {
  const a = content.attempt;
  return typeof a === "number" && a >= 1 ? a : null;
}

/** Pull the primary output from a review/plan envelope `content` bag. */
export function getReviewPayload(content: Record<string, unknown>): ReviewPayload {
  const attempt = getAttempt(content);
  for (const key of PREFERRED_OUTPUT_KEYS) {
    if (key in content && !META_KEYS.has(key)) {
      return { outputKey: key, value: content[key], attempt };
    }
  }
  const keys = Object.keys(content).filter((k) => !META_KEYS.has(k));
  if (keys.length === 1) {
    return { outputKey: keys[0], value: content[keys[0]], attempt };
  }
  if (keys.length > 1) {
    return { outputKey: null, value: content, attempt };
  }
  return { outputKey: null, value: null, attempt };
}

export function planTextFromContent(content: Record<string, unknown>): string {
  const { value } = getReviewPayload(content);
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "content" in (value as object)) {
    const c = (value as { content: unknown }).content;
    if (typeof c === "string") return c;
  }
  if (typeof content.content === "string") return content.content;
  try {
    return JSON.stringify(value ?? content, null, 2);
  } catch {
    return String(value ?? "");
  }
}

export type OpenQuestion = {
  id: string;
  prompt: string;
};

export function parseOpenQuestions(content: Record<string, unknown>): OpenQuestion[] {
  const raw = content.open_questions;
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => {
    if (typeof item === "string") {
      return { id: `q${i}`, prompt: item };
    }
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const prompt = String(obj.question ?? obj.prompt ?? obj.text ?? JSON.stringify(item));
      const id = String(obj.id ?? `q${i}`);
      return { id, prompt };
    }
    return { id: `q${i}`, prompt: String(item) };
  });
}

export function formatAttemptBadge(attempt: number | null): string | null {
  if (attempt == null || attempt < 2) return null;
  const n = attempt;
  const suffix =
    n % 10 === 1 && n % 100 !== 11
      ? "st"
      : n % 10 === 2 && n % 100 !== 12
        ? "nd"
        : n % 10 === 3 && n % 100 !== 13
          ? "rd"
          : "th";
  return `${n}${suffix} regeneration`;
}

export function hitlTitle(envelope: InterruptEnvelope): string {
  if (envelope.phase === "clarification") return "Clarification needed";
  if (envelope.phase === "plan") return "Approve plan";
  return "Review output";
}

export function stepLabel(stepId: string | null | undefined): string | null {
  if (!stepId) return null;
  return INNER_LABELS[stepId] ?? stepId;
}

export function valueToEditorText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Parse editor text back into the type expected for resume `edited_content`. */
export function parseEditedContent(
  outputKey: string | null,
  raw: string,
  original: unknown
): Record<string, unknown> | unknown[] | string | null {
  const trimmed = raw;
  if (typeof original === "string" || outputKey === "draft") {
    return trimmed;
  }
  if (original == null && outputKey === "draft") return trimmed;
  try {
    return JSON.parse(trimmed) as Record<string, unknown> | unknown[];
  } catch {
    // Bare string fallback — BE may 422; card keeps the error.
    return trimmed;
  }
}

export function canAct(envelope: InterruptEnvelope, action: ResumeAction): boolean {
  return envelope.allowed_actions.includes(action);
}

/**
 * Plan-type HITL gates that Auto-approve may skip:
 * step plans (`phase: plan`), global plan, and section plan (not section output review).
 */
export function isPlanGate(envelope: InterruptEnvelope): boolean {
  if (envelope.phase === "plan") return true;
  if (envelope.tier === "global") return true;
  if (
    envelope.tier === "section" &&
    envelope.step_id == null &&
    !("completed_sections" in envelope.content)
  ) {
    return true;
  }
  return false;
}
