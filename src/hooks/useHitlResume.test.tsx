import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import InterruptCard from "../components/hitl/InterruptCard";
import { envelopeKey } from "../components/hitl/hitlContent";
import { useHitlResume } from "./useHitlResume";
import { renderHook } from "@testing-library/react";
import type { InterruptEnvelope } from "../types/api";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function sseResponse(text: string) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  return new HttpResponse(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

const planEnvelope: InterruptEnvelope = {
  interrupt_id: "irq-plan-1",
  tier: "section",
  phase: "plan",
  section_id: "quality_of_earnings",
  step_id: "draft.plan",
  content: { step_plan: "Outline QoE revenue bridges." },
  allowed_actions: ["approve", "edit", "reject"],
};

const reviewEnvelope: InterruptEnvelope = {
  interrupt_id: "irq-review-1",
  tier: "step",
  phase: "review",
  section_id: "quality_of_earnings",
  step_id: "draft.review",
  content: { draft: "First draft of QoE.", attempt: 1 },
  allowed_actions: ["approve", "edit", "reject"],
};

describe("InterruptCard", () => {
  it("sends approve with interrupt_id", async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    render(<InterruptCard envelope={planEnvelope} onResume={onResume} />);

    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(onResume).toHaveBeenCalledWith(
      { action: "approve", interrupt_id: "irq-plan-1" },
      planEnvelope
    );
  });

  it("sends reject with reason (+ edited_content feedback dual-write)", async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    render(<InterruptCard envelope={reviewEnvelope} onResume={onResume} />);

    await user.type(
      screen.getByPlaceholderText(/what should change/i),
      "Tighten YoY commentary"
    );
    await user.click(screen.getByRole("button", { name: "Reject" }));

    expect(onResume).toHaveBeenCalledWith(
      {
        action: "reject",
        interrupt_id: "irq-review-1",
        reason: "Tighten YoY commentary",
        edited_content: { reason: "Tighten YoY commentary" },
      },
      reviewEnvelope
    );
  });

  it("sends edit as bare draft string", async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    render(<InterruptCard envelope={reviewEnvelope} onResume={onResume} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const editor = screen.getByDisplayValue("First draft of QoE.");
    await user.clear(editor);
    await user.type(editor, "Edited draft.");
    await user.click(screen.getByRole("button", { name: "Submit edit" }));

    expect(onResume).toHaveBeenCalledWith(
      {
        action: "edit",
        interrupt_id: "irq-review-1",
        edited_content: "Edited draft.",
      },
      reviewEnvelope
    );
  });
});

describe("useHitlResume", () => {
  it("posts resume body including interrupt_id and drains the stack", async () => {
    let resumeBodies: unknown[] = [];
    server.use(
      http.post("/sessions/t-hitl/resume", async ({ request }) => {
        resumeBodies.push(await request.json());
        return sseResponse(
          ['event: step', 'data: {"node":"draft.execute","namespace":[]}', "", "event: done", "data: {}", ""].join(
            "\n"
          )
        );
      })
    );

    const { result } = renderHook(() => useHitlResume({ threadId: "t-hitl" }));

    act(() => {
      result.current.pushInterrupt(planEnvelope);
    });
    expect(result.current.current?.interrupt_id).toBe("irq-plan-1");

    await act(async () => {
      const ok = await result.current.resume(
        { action: "approve", interrupt_id: "irq-plan-1" },
        { envelope: planEnvelope }
      );
      expect(ok).toBe(true);
    });

    expect(resumeBodies).toEqual([
      { action: "approve", interrupt_id: "irq-plan-1" },
    ]);
    expect(result.current.stack).toEqual([]);
    expect(result.current.history).toHaveLength(1);
  });

  it("dedupes double Approve — second call is a no-op while in-flight / after resolve", async () => {
    let resumeCount = 0;
    server.use(
      http.post("/sessions/t-hitl/resume", async () => {
        resumeCount += 1;
        await new Promise((r) => setTimeout(r, 40));
        return sseResponse("event: done\ndata: {}\n\n");
      })
    );

    const { result } = renderHook(() => useHitlResume({ threadId: "t-hitl" }));
    act(() => {
      result.current.pushInterrupt(planEnvelope);
    });

    let first = false;
    let second = false;
    await act(async () => {
      const p1 = result.current.resume(
        { action: "approve", interrupt_id: "irq-plan-1" },
        { envelope: planEnvelope }
      );
      const p2 = result.current.resume(
        { action: "approve", interrupt_id: "irq-plan-1" },
        { envelope: planEnvelope }
      );
      first = await p1;
      second = await p2;
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(resumeCount).toBe(1);
  });

  it("on 409 refetches GET /state and does not blind-retry", async () => {
    let resumeHits = 0;
    const nextInterrupt: InterruptEnvelope = {
      ...planEnvelope,
      interrupt_id: "irq-plan-2",
      content: { step_plan: "Next gate." },
    };

    server.use(
      http.post("/sessions/t-hitl/resume", () => {
        resumeHits += 1;
        return HttpResponse.json(
          { detail: "Interrupt already answered or stale." },
          { status: 409 }
        );
      }),
      http.get("/sessions/t-hitl/state", () =>
        HttpResponse.json({
          values: {},
          next: [],
          interrupt: nextInterrupt,
          section_state: null,
        })
      )
    );

    const { result } = renderHook(() => useHitlResume({ threadId: "t-hitl" }));
    act(() => {
      result.current.pushInterrupt(planEnvelope);
    });

    await act(async () => {
      const ok = await result.current.resume(
        { action: "approve", interrupt_id: "irq-plan-1" },
        { envelope: planEnvelope }
      );
      expect(ok).toBe(false);
    });

    expect(resumeHits).toBe(1);
    await waitFor(() => {
      expect(result.current.current?.interrupt_id).toBe("irq-plan-2");
    });
    expect(result.current.resumeError).toMatch(/already answered|stale/i);
  });

  it("bulk-approve auto-resumes plan gates", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post("/sessions/t-hitl/resume", async ({ request }) => {
        bodies.push(await request.json());
        return sseResponse("event: done\ndata: {}\n\n");
      })
    );

    const { result } = renderHook(() => useHitlResume({ threadId: "t-hitl" }));

    act(() => {
      result.current.setBulkApprovePlans(true);
      result.current.pushInterrupt(planEnvelope);
    });

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ action: "approve", interrupt_id: "irq-plan-1" });
    expect(result.current.history[0]?.auto).toBe(true);
  });
});

describe("envelopeKey", () => {
  it("falls back when interrupt_id is missing", () => {
    const bare = { ...planEnvelope, interrupt_id: "" };
    expect(envelopeKey(bare)).toContain("plan");
    expect(envelopeKey(bare)).toContain("quality_of_earnings");
  });
});
