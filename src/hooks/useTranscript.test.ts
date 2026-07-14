import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportTranscriptPlainText,
  useTranscript,
  type TranscriptEntry,
} from "./useTranscript";
import type { InterruptEnvelope } from "../types/api";

const THREAD = "t-transcript";

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

const interrupt: InterruptEnvelope = {
  interrupt_id: "irq-1",
  tier: "step",
  phase: "plan",
  section_id: "quality_of_earnings",
  step_id: "draft.plan",
  content: { step_plan: "Outline" },
  allowed_actions: ["approve", "edit", "reject"],
};

describe("useTranscript", () => {
  it("batches consecutive tokens for the same node", () => {
    const { result } = renderHook(() => useTranscript(THREAD));

    act(() => {
      result.current.applyEvent({
        type: "token",
        text: "Hello ",
        node: "draft",
        namespace: ["draft"],
      });
      result.current.applyEvent({
        type: "token",
        text: "world",
        node: "draft",
        namespace: ["draft"],
      });
      result.current.applyEvent({
        type: "token",
        text: "Other",
        node: "review",
        namespace: ["review"],
      });
    });

    const assistants = result.current.entries.filter((e) => e.kind === "assistant");
    expect(assistants).toHaveLength(2);
    expect(assistants[0]).toMatchObject({ node: "draft", text: "Hello world" });
    expect(assistants[1]).toMatchObject({ node: "review", text: "Other" });
  });

  it("persists and restores from sessionStorage", () => {
    const { result, unmount } = renderHook(() => useTranscript(THREAD));

    act(() => {
      result.current.logSystem("Databook ready.");
      result.current.logInstruction("focus on churn");
    });

    expect(result.current.entries).toHaveLength(2);
    unmount();

    const { result: again } = renderHook(() => useTranscript(THREAD));
    expect(again.current.entries).toHaveLength(2);
    expect(again.current.entries[0]).toMatchObject({
      kind: "system",
      text: "Databook ready.",
    });
    expect(again.current.entries[1]).toMatchObject({
      kind: "instruction",
      text: "focus on churn",
    });
  });

  it("logs decisions idempotently and clearForNewRun confirms", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { result } = renderHook(() => useTranscript(THREAD));

    act(() => {
      result.current.applyEvent({
        type: "interrupt",
        interruptId: "irq-1",
        envelope: interrupt,
      });
      result.current.logDecision({
        action: "approve",
        interruptId: "irq-1",
      });
      result.current.logDecision({
        action: "approve",
        interruptId: "irq-1",
      });
    });

    expect(
      result.current.entries.filter((e) => e.kind === "decision")
    ).toHaveLength(1);

    let cleared = false;
    act(() => {
      cleared = result.current.clearForNewRun({ confirm: true });
    });
    expect(confirm).toHaveBeenCalled();
    expect(cleared).toBe(true);
    expect(result.current.entries).toHaveLength(0);
  });

  it("clearForNewRun aborts when user declines", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = renderHook(() => useTranscript(THREAD));

    act(() => {
      result.current.logSystem("keep me");
    });

    let cleared = true;
    act(() => {
      cleared = result.current.clearForNewRun({ confirm: true });
    });
    expect(cleared).toBe(false);
    expect(result.current.entries).toHaveLength(1);
  });

  it("exportTranscriptPlainText covers entry kinds", () => {
    const entries: TranscriptEntry[] = [
      {
        id: "1",
        kind: "system",
        text: "ready",
        at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "2",
        kind: "instruction",
        text: "focus",
        at: "2026-01-01T00:01:00.000Z",
      },
      {
        id: "3",
        kind: "decision",
        action: "approve",
        interruptId: "irq-1",
        auto: true,
        at: "2026-01-01T00:02:00.000Z",
      },
    ];
    const plain = exportTranscriptPlainText(entries);
    expect(plain).toMatch(/system: ready/);
    expect(plain).toMatch(/instruction: focus/);
    expect(plain).toMatch(/decision: approve \(auto\)/);
  });
});
