import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  classifySessionReconnect,
  useSessionReconnect,
} from "./useSessionReconnect";
import {
  classifyReconnectStatus,
  ORCHESTRATOR_POLL_MS,
  useRunOrchestrator,
} from "./useRunOrchestrator";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
  vi.restoreAllMocks();
});
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

describe("classifySessionReconnect", () => {
  it("prefers interrupt, then needs_continue when next is non-empty", () => {
    const interrupt = {
      interrupt_id: "irq-1",
      tier: "step" as const,
      phase: "plan" as const,
      section_id: "qoe",
      step_id: "draft.plan",
      content: {},
      allowed_actions: ["approve" as const],
    };
    expect(
      classifySessionReconnect({
        status: { run_status: "generating", audit_status: null, current_section_index: 0 },
        state: { values: {}, next: ["run_section"], interrupt, section_state: null },
      }).kind
    ).toBe("paused");

    expect(
      classifySessionReconnect({
        status: { run_status: "generating", audit_status: null, current_section_index: 0 },
        state: { values: {}, next: ["run_section"], interrupt: null, section_state: null },
      }).kind
    ).toBe("needs_continue");

    expect(
      classifySessionReconnect({
        status: { run_status: "generating", audit_status: null, current_section_index: 0 },
        state: { values: {}, next: [], interrupt: null, section_state: null },
      }).kind
    ).toBe("server_running");
  });
});

describe("classifyReconnectStatus", () => {
  it("maps interrupt / continue / active", () => {
    expect(classifyReconnectStatus("generating", true)).toBe("paused");
    expect(classifyReconnectStatus("generating", false, ["run_section"])).toBe(
      "needs_continue"
    );
    expect(classifyReconnectStatus("generating", false, [])).toBe("server_running");
    expect(ORCHESTRATOR_POLL_MS).toBe(4000);
  });
});

describe("useSessionReconnect", () => {
  it("opens SSE via POST /continue", async () => {
    const events: string[] = [];
    server.use(
      http.post("/sessions/t-cont/continue", () =>
        sseResponse(
          [
            'event: step',
            'data: {"node":"draft.execute","namespace":[]}',
            "",
            "event: interrupt",
            'data: {"interrupt_id":"irq-c","tier":"step","phase":"review","section_id":null,"step_id":null,"content":{},"allowed_actions":["approve"]}',
            "",
          ].join("\n")
        )
      )
    );

    const { result } = renderHook(() =>
      useSessionReconnect({
        threadId: "t-cont",
        onEvent: (ev) => events.push(ev.type),
      })
    );

    let outcome = { ok: false, error: null as string | null };
    await act(async () => {
      outcome = await result.current.continueFromCheckpoint();
    });

    expect(outcome.ok).toBe(true);
    expect(events).toEqual(["step", "interrupt"]);
  });

  it("surfaces 404 when continue has no run state", async () => {
    server.use(
      http.post("/sessions/t-cont/continue", () =>
        HttpResponse.json(
          { detail: "Unknown thread — nothing to continue." },
          { status: 404 }
        )
      )
    );

    const { result } = renderHook(() =>
      useSessionReconnect({
        threadId: "t-cont",
        onEvent: () => undefined,
      })
    );

    let outcome = { ok: true, error: null as string | null };
    await act(async () => {
      outcome = await result.current.continueFromCheckpoint();
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/Unknown thread|nothing to continue/i);
  });
});

describe("useRunOrchestrator lifecycle", () => {
  it("offers needs_continue when next is non-empty after refresh", async () => {
    server.use(
      http.get("/sessions/t-nc/status", () =>
        HttpResponse.json({
          run_status: "generating",
          audit_status: "passed",
          current_section_index: 0,
        })
      ),
      http.get("/sessions/t-nc/state", () =>
        HttpResponse.json({
          values: {
            selected_sections: ["quality_of_earnings"],
            run_status: "generating",
          },
          next: ["run_section"],
          interrupt: null,
          section_state: null,
        })
      )
    );

    const { result } = renderHook(() => useRunOrchestrator("t-nc"));
    await waitFor(() => expect(result.current.phase).toBe("needs_continue"));
    expect(result.current.offerContinue).toBe(true);
    expect(result.current.banner).toMatch(/disconnect/i);
  });

  it("enters server_running when active with empty next", async () => {
    server.use(
      http.get("/sessions/t-sr/status", () =>
        HttpResponse.json({
          run_status: "generating",
          audit_status: "passed",
          current_section_index: 0,
        })
      ),
      http.get("/sessions/t-sr/state", () =>
        HttpResponse.json({
          values: { selected_sections: ["business_overview"], run_status: "generating" },
          next: [],
          interrupt: null,
          section_state: null,
        })
      )
    );

    const { result } = renderHook(() => useRunOrchestrator("t-sr"));
    await waitFor(() => expect(result.current.phase).toBe("server_running"));
    expect(result.current.offerContinue).toBe(false);
  });

  it("cancels a paused run and unlocks the composer", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);

    server.use(
      http.get("/sessions/t-cancel/status", () =>
        HttpResponse.json({
          run_status: "awaiting_approval",
          audit_status: "passed",
          current_section_index: 0,
        })
      ),
      http.get("/sessions/t-cancel/state", () =>
        HttpResponse.json({
          values: { selected_sections: ["business_overview"] },
          next: [],
          interrupt: {
            interrupt_id: "irq-x",
            tier: "step",
            phase: "review",
            section_id: null,
            step_id: null,
            content: {},
            allowed_actions: ["approve"],
          },
          section_state: null,
        })
      ),
      http.post("/sessions/t-cancel/cancel", () =>
        HttpResponse.json({
          cancelled: true,
          was_running: false,
          run_status: "cancelled",
        })
      )
    );

    const { result } = renderHook(() => useRunOrchestrator("t-cancel"));
    await waitFor(() => expect(result.current.phase).toBe("paused"));

    await act(async () => {
      await result.current.cancelRun();
    });

    expect(result.current.phase).toBe("cancelled");
    expect(result.current.cancelDisabled).toBe(true);
    expect(result.current.locked).toBe(false);
    expect(result.current.hitl.stack).toEqual([]);
  });
});
