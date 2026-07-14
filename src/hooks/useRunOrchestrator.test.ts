import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
  sessionStorage.clear();
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

describe("classifyReconnectStatus", () => {
  it("maps interrupt and active statuses", () => {
    expect(classifyReconnectStatus("generating", true)).toBe("paused");
    expect(classifyReconnectStatus("generating", false, ["x"])).toBe("needs_continue");
    expect(classifyReconnectStatus("generating", false, [])).toBe("server_running");
    expect(classifyReconnectStatus("completed", false)).toBe("completed");
    expect(classifyReconnectStatus(null, false)).toBe("idle");
  });
});

describe("useRunOrchestrator", () => {
  it("enters server_running with banner when BE is generating without next", async () => {
    server.use(
      http.get("/sessions/t-orch/status", () =>
        HttpResponse.json({
          run_status: "generating",
          audit_status: "passed",
          current_section_index: 0,
        })
      ),
      http.get("/sessions/t-orch/state", () =>
        HttpResponse.json({
          values: {
            selected_sections: ["quality_of_earnings"],
            run_status: "generating",
          },
          next: [],
          interrupt: null,
          section_state: null,
        })
      )
    );

    const { result } = renderHook(() => useRunOrchestrator("t-orch"));

    await waitFor(() => expect(result.current.phase).toBe("server_running"));
    expect(result.current.banner).toMatch(/live preview unavailable/i);
    expect(result.current.locked).toBe(true);
    expect(ORCHESTRATOR_POLL_MS).toBe(4000);
  });

  it("hydrates paused HITL from GET /state.interrupt on mount", async () => {
    const interrupt = {
      interrupt_id: "irq-mount",
      tier: "step",
      phase: "plan",
      section_id: "quality_of_earnings",
      step_id: "draft.plan",
      content: { step_plan: "Plan text" },
      allowed_actions: ["approve", "edit", "reject"],
    };

    server.use(
      http.get("/sessions/t-orch/status", () =>
        HttpResponse.json({
          run_status: "awaiting_approval",
          audit_status: "passed",
          current_section_index: 0,
        })
      ),
      http.get("/sessions/t-orch/state", () =>
        HttpResponse.json({
          values: {
            selected_sections: ["quality_of_earnings"],
            run_status: "awaiting_approval",
          },
          next: [],
          interrupt,
          section_state: null,
        })
      )
    );

    const { result } = renderHook(() => useRunOrchestrator("t-orch"));

    await waitFor(() => expect(result.current.phase).toBe("paused"));
    expect(result.current.hitl.current?.interrupt_id).toBe("irq-mount");
    expect(result.current.banner).toBeNull();
  });

  it("polls server_running until interrupt appears", async () => {
    let ticks = 0;
    server.use(
      http.get("/sessions/t-poll/status", () => {
        ticks += 1;
        return HttpResponse.json({
          run_status: ticks >= 2 ? "awaiting_approval" : "generating",
          audit_status: "passed",
          current_section_index: 0,
        });
      }),
      http.get("/sessions/t-poll/state", () => {
        if (ticks >= 2) {
          return HttpResponse.json({
            values: {
              selected_sections: ["business_overview"],
              run_status: "awaiting_approval",
            },
            next: [],
            interrupt: {
              interrupt_id: "irq-poll",
              tier: "global",
              phase: "review",
              section_id: null,
              step_id: null,
              content: { global_plan: { content: "G" } },
              allowed_actions: ["approve"],
            },
            section_state: null,
          });
        }
        return HttpResponse.json({
          values: {
            selected_sections: ["business_overview"],
            run_status: "generating",
          },
          next: [],
          interrupt: null,
          section_state: null,
        });
      })
    );

    const { result } = renderHook(() =>
      useRunOrchestrator("t-poll", { pollMs: 50 })
    );
    await waitFor(() => expect(result.current.phase).toBe("server_running"));

    await waitFor(() => expect(result.current.phase).toBe("paused"), {
      timeout: 3000,
    });
    expect(result.current.hitl.current?.interrupt_id).toBe("irq-poll");
  });

  it("guards double start — only one POST /start", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let startCount = 0;
    server.use(
      http.get("/sessions/t-start/status", () =>
        HttpResponse.json({
          run_status: null,
          audit_status: null,
          current_section_index: null,
        })
      ),
      http.get("/sessions/t-start/state", () =>
        HttpResponse.json({
          values: {},
          next: [],
          interrupt: null,
          section_state: null,
        })
      ),
      http.get("/sections", () => HttpResponse.json({ sections: [] })),
      http.post("/sessions/t-start/start", async () => {
        startCount += 1;
        await new Promise((r) => setTimeout(r, 80));
        return sseResponse(
          [
            'event: step',
            'data: {"node":"ingest","namespace":[]}',
            "",
            "event: done",
            "data: {}",
            "",
          ].join("\n")
        );
      }),
      http.get("/sessions/t-start/document", () =>
        new HttpResponse("# ok", { headers: { "Content-Type": "text/markdown" } })
      )
    );

    const { result } = renderHook(() => useRunOrchestrator("t-start", { pollMs: 60_000 }));
    await waitFor(() => expect(result.current.phase).toMatch(/no_document|ready/));

    act(() => {
      result.current.setDatabookReady(true, "doc-1");
    });
    await waitFor(() => expect(result.current.phase).toBe("ready"));

    await act(async () => {
      const p1 = result.current.startRun({
        selected_sections: ["quality_of_earnings"],
        document_ref: "doc-1",
        approval_policy: "balanced",
      });
      const p2 = result.current.startRun({
        selected_sections: ["quality_of_earnings"],
        document_ref: "doc-1",
        approval_policy: "balanced",
      });
      await Promise.all([p1, p2]);
    });

    expect(startCount).toBe(1);
    await waitFor(() => expect(result.current.phase).toBe("completed"));
  });

  it("sendInstruction logs on success and surfaces 404", async () => {
    server.use(
      http.get("/sessions/t-inst/status", () =>
        HttpResponse.json({
          run_status: null,
          audit_status: null,
          current_section_index: null,
        })
      ),
      http.get("/sessions/t-inst/state", () =>
        HttpResponse.json({
          values: {},
          next: [],
          interrupt: null,
          section_state: null,
        })
      ),
      http.post("/sessions/t-inst/instruction", async ({ request }) => {
        const body = (await request.json()) as { text: string };
        if (body.text === "missing") {
          return HttpResponse.json({ detail: "Not Found" }, { status: 404 });
        }
        return HttpResponse.json({ ok: true, instruction_count: 2 });
      })
    );

    const { result } = renderHook(() =>
      useRunOrchestrator("t-inst", { pollMs: 60_000 })
    );
    await waitFor(() => expect(result.current.phase).toMatch(/no_document|ready/));

    await act(async () => {
      await result.current.sendInstruction("focus on churn");
    });
    expect(
      result.current.transcript.entries.some(
        (e) => e.kind === "instruction" && e.text === "focus on churn"
      )
    ).toBe(true);

    await act(async () => {
      await result.current.sendInstruction("missing");
    });
    expect(result.current.instructionError).toMatch(/POST \/instruction missing/i);
  });
});
