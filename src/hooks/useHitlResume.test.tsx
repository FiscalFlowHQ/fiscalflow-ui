import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import InterruptCard from "../components/hitl/InterruptCard";
import { envelopeKey, isPlanGate } from "../components/hitl/hitlContent";
import { useHitlResume } from "./useHitlResume";
import { renderHook } from "@testing-library/react";
import type { InterruptEnvelope } from "../types/api";

const server = setupServer(
  http.patch("/sessions/:threadId/hitl", () =>
    HttpResponse.json({
      auto_approve_plans: true,
      approval_policy: { global_plan: "auto" },
    })
  )
);

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
      const outcome = await result.current.resume(
        { action: "approve", interrupt_id: "irq-plan-1" },
        { envelope: planEnvelope }
      );
      expect(outcome).toEqual({ ok: true, orphaned: false });
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

    let first = { ok: false, orphaned: false };
    let second = { ok: false, orphaned: false };
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

    expect(first).toEqual({ ok: true, orphaned: false });
    expect(second).toEqual({ ok: false, orphaned: false });
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
      const outcome = await result.current.resume(
        { action: "approve", interrupt_id: "irq-plan-1" },
        { envelope: planEnvelope }
      );
      expect(outcome).toEqual({ ok: false, orphaned: false });
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

  it("bulk-approve covers global plan (phase review) and toggle approves current", async () => {
    const globalPlan: InterruptEnvelope = {
      interrupt_id: "irq-global",
      tier: "global",
      phase: "review",
      section_id: null,
      step_id: null,
      content: { global_plan: { content: "Global outline" } },
      allowed_actions: ["approve", "edit", "reject"],
    };
    expect(isPlanGate(globalPlan)).toBe(true);

    const bodies: unknown[] = [];
    server.use(
      http.post("/sessions/t-hitl/resume", async ({ request }) => {
        bodies.push(await request.json());
        return sseResponse("event: done\ndata: {}\n\n");
      }),
      http.patch("/sessions/t-hitl/hitl", async ({ request }) => {
        const body = (await request.json()) as { auto_approve_plans: boolean };
        return HttpResponse.json({
          auto_approve_plans: body.auto_approve_plans,
          approval_policy: { global_plan: "auto" },
        });
      })
    );

    const { result } = renderHook(() => useHitlResume({ threadId: "t-hitl" }));

    act(() => {
      result.current.pushInterrupt(globalPlan);
    });
    expect(result.current.current?.interrupt_id).toBe("irq-global");

    act(() => {
      result.current.setBulkApprovePlans(true);
    });

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ action: "approve", interrupt_id: "irq-global" });
    expect(result.current.history[0]?.auto).toBe(true);
  });

  it("does not bulk-approve section output review", async () => {
    const sectionReview: InterruptEnvelope = {
      interrupt_id: "irq-sec-rev",
      tier: "section",
      phase: "review",
      section_id: "quality_of_earnings",
      step_id: null,
      content: { completed_sections: ["quality_of_earnings"], draft: "Section out" },
      allowed_actions: ["approve", "edit", "reject"],
    };
    expect(isPlanGate(sectionReview)).toBe(false);

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
      result.current.pushInterrupt(sectionReview);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(bodies).toHaveLength(0);
    expect(result.current.current?.interrupt_id).toBe("irq-sec-rev");
  });

  it("serializes bulk auto-approve while a resume is in flight (no parallel POST)", async () => {
    const bodies: unknown[] = [];
    let releaseFirst: (() => void) | null = null;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const plan2: InterruptEnvelope = {
      ...planEnvelope,
      interrupt_id: "irq-plan-2",
      step_id: "outline.plan",
    };

    server.use(
      http.post("/sessions/t-hitl/resume", async ({ request }) => {
        const body = await request.json();
        bodies.push(body);
        if (bodies.length === 1) {
          await firstGate;
        }
        return sseResponse("event: done\ndata: {}\n\n");
      })
    );

    const { result } = renderHook(() => useHitlResume({ threadId: "t-hitl" }));

    act(() => {
      result.current.setBulkApprovePlans(true);
    });

    let p1!: Promise<{ ok: boolean; orphaned: boolean }>;
    await act(async () => {
      p1 = result.current.resume(
        { action: "approve", interrupt_id: "irq-plan-1" },
        { envelope: planEnvelope }
      );
    });

    await waitFor(() => expect(bodies).toHaveLength(1));

    act(() => {
      // Mid-flight: next plan gate arrives (as after Approve → next interrupt).
      result.current.pushInterrupt(plan2);
    });

    expect(bodies).toHaveLength(1);

    await act(async () => {
      releaseFirst?.();
      await p1;
    });

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[0]).toEqual({ action: "approve", interrupt_id: "irq-plan-1" });
    expect(bodies[1]).toEqual({ action: "approve", interrupt_id: "irq-plan-2" });
    expect(result.current.history.filter((h) => h.auto)).toHaveLength(1);
  });

  it("invokes onStreamSettled after resume completes", async () => {
    const settled = vi.fn();
    server.use(
      http.post("/sessions/t-hitl/resume", () =>
        sseResponse("event: done\ndata: {}\n\n")
      )
    );

    const { result } = renderHook(() =>
      useHitlResume({ threadId: "t-hitl", onStreamSettled: settled })
    );

    await act(async () => {
      await result.current.resume(
        { action: "approve", interrupt_id: "irq-plan-1" },
        { envelope: planEnvelope }
      );
    });

    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("calls onOrphanedCheckpoint when resume 409 has no interrupt", async () => {
    const orphaned = vi.fn();
    server.use(
      http.post("/sessions/t-hitl/resume", () =>
        HttpResponse.json(
          { detail: "No pending interrupt on this thread; use /continue" },
          { status: 409 }
        )
      ),
      http.get("/sessions/t-hitl/state", () =>
        HttpResponse.json({
          values: { run_status: "generating" },
          next: ["run_section"],
          interrupt: null,
          section_state: null,
        })
      )
    );

    const { result } = renderHook(() =>
      useHitlResume({
        threadId: "t-hitl",
        onOrphanedCheckpoint: orphaned,
      })
    );

    await act(async () => {
      const outcome = await result.current.resume(
        { action: "approve", interrupt_id: "irq-plan-1" },
        { envelope: planEnvelope }
      );
      expect(outcome).toEqual({ ok: false, orphaned: true });
    });

    expect(orphaned).toHaveBeenCalledTimes(1);
    expect(result.current.resumeError).toBeNull();
    expect(result.current.stack).toEqual([]);
  });
});

describe("envelopeKey", () => {
  it("falls back when interrupt_id is missing", () => {
    const bare = { ...planEnvelope, interrupt_id: "" };
    expect(envelopeKey(bare)).toContain("plan");
    expect(envelopeKey(bare)).toContain("quality_of_earnings");
  });
});
