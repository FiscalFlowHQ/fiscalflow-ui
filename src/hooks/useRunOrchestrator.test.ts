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

  it("restores databookReady from session documentRef after ingest-only return", async () => {
    const now = new Date().toISOString();
    localStorage.setItem(
      "fiscalflow.sessions.v1",
      JSON.stringify([
        {
          threadId: "t-restore",
          title: "FDD run · restored",
          createdAt: now,
          lastOpenedAt: now,
          documentRef: "doc-already-ready",
        },
      ])
    );

    server.use(
      http.get("/documents/doc-already-ready/status", () =>
        HttpResponse.json({
          status: "ready",
          audit_status: "passed",
          progress_pct: 100,
        })
      ),
      // No generation yet — reconnect 404 must not clear databook readiness.
      http.get("/sessions/t-restore/status", () =>
        HttpResponse.json({ detail: "Unknown thread" }, { status: 404 })
      ),
      http.get("/sessions/t-restore/state", () =>
        HttpResponse.json({ detail: "Unknown thread" }, { status: 404 })
      )
    );

    const { result } = renderHook(() => useRunOrchestrator("t-restore"));

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    await waitFor(() => expect(result.current.databookReady).toBe(true));
    expect(result.current.documentRef).toBe("doc-already-ready");
    expect(result.current.phase).toBe("ready");
  });

  it("after approve SSE dies mid-run, auto-continues from checkpoint", async () => {
    const interrupt = {
      interrupt_id: "irq-sec-plan",
      tier: "section",
      phase: "plan",
      section_id: "business_overview",
      step_id: null,
      content: { section_plan: "Plan" },
      allowed_actions: ["approve", "edit", "reject"],
    };
    const nextInterrupt = {
      ...interrupt,
      interrupt_id: "irq-after-continue",
      content: { section_plan: "Next plan" },
    };

    let statusMode: "paused" | "orphaned" | "recovered" = "paused";
    let continueHits = 0;

    server.use(
      http.get("/sessions/t-orphan/status", () => {
        if (statusMode === "paused" || statusMode === "recovered") {
          return HttpResponse.json({
            run_status: "awaiting_approval",
            audit_status: "passed",
            current_section_index: 0,
          });
        }
        return HttpResponse.json({
          run_status: "generating",
          audit_status: "passed",
          current_section_index: 0,
        });
      }),
      http.get("/sessions/t-orphan/state", () => {
        if (statusMode === "paused") {
          return HttpResponse.json({
            values: {
              selected_sections: ["business_overview"],
              run_status: "awaiting_approval",
            },
            next: [],
            interrupt,
            section_state: null,
          });
        }
        if (statusMode === "recovered") {
          return HttpResponse.json({
            values: {
              selected_sections: ["business_overview"],
              run_status: "awaiting_approval",
            },
            next: [],
            interrupt: nextInterrupt,
            section_state: {
              section_id: "business_overview",
              step_trace: ["gather_context"],
            },
          });
        }
        return HttpResponse.json({
          values: {
            selected_sections: ["business_overview"],
            run_status: "generating",
          },
          next: ["run_section"],
          interrupt: null,
          section_state: { section_id: "business_overview", step_trace: ["gather_context"] },
        });
      }),
      http.post("/sessions/t-orphan/resume", async () => {
        statusMode = "orphaned";
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'event: step\ndata: {"node":"run_section","namespace":[]}\n\n'
              )
            );
            controller.close();
          },
        });
        return new HttpResponse(stream, {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
      http.post("/sessions/t-orphan/continue", async () => {
        continueHits += 1;
        statusMode = "recovered";
        return sseResponse(
          `event: interrupt\ndata: ${JSON.stringify(nextInterrupt)}\n\n`
        );
      })
    );

    const { result } = renderHook(() =>
      useRunOrchestrator("t-orphan", { pollMs: 60_000 })
    );

    await waitFor(() => expect(result.current.phase).toBe("paused"));
    expect(result.current.hitl.current?.interrupt_id).toBe("irq-sec-plan");

    await act(async () => {
      result.current.resumeRun(
        { action: "approve", interrupt_id: "irq-sec-plan" },
        interrupt as never
      );
    });

    await waitFor(() => expect(continueHits).toBe(1), { timeout: 3000 });
    await waitFor(() => expect(result.current.phase).toBe("paused"), {
      timeout: 3000,
    });
    expect(result.current.hitl.current?.interrupt_id).toBe("irq-after-continue");
    expect(result.current.offerContinue).toBe(false);
  });

  it("approve that lands on a new interrupt does not auto-continue", async () => {
    const interrupt = {
      interrupt_id: "irq-plan-a",
      tier: "section",
      phase: "plan",
      section_id: "business_overview",
      step_id: null,
      content: { section_plan: "Plan A" },
      allowed_actions: ["approve", "edit", "reject"],
    };
    const nextInterrupt = {
      ...interrupt,
      interrupt_id: "irq-plan-b",
      content: { section_plan: "Plan B" },
    };

    let continueHits = 0;
    let mode: "first" | "after" = "first";

    server.use(
      http.get("/sessions/t-approve-ok/status", () =>
        HttpResponse.json({
          run_status: "awaiting_approval",
          audit_status: "passed",
          current_section_index: 0,
        })
      ),
      http.get("/sessions/t-approve-ok/state", () => {
        if (mode === "first") {
          return HttpResponse.json({
            values: {
              selected_sections: ["business_overview"],
              run_status: "awaiting_approval",
            },
            next: [],
            interrupt,
            section_state: null,
          });
        }
        return HttpResponse.json({
          values: {
            selected_sections: ["business_overview"],
            run_status: "awaiting_approval",
          },
          next: [],
          interrupt: nextInterrupt,
          section_state: {
            section_id: "business_overview",
            step_trace: ["gather_context"],
          },
        });
      }),
      http.post("/sessions/t-approve-ok/resume", async () => {
        mode = "after";
        return sseResponse(
          `event: interrupt\ndata: ${JSON.stringify(nextInterrupt)}\n\n`
        );
      }),
      http.post("/sessions/t-approve-ok/continue", async () => {
        continueHits += 1;
        return sseResponse("event: done\ndata: {}\n\n");
      })
    );

    const { result } = renderHook(() =>
      useRunOrchestrator("t-approve-ok", { pollMs: 60_000 })
    );

    await waitFor(() => expect(result.current.phase).toBe("paused"));

    await act(async () => {
      result.current.resumeRun(
        { action: "approve", interrupt_id: "irq-plan-a" },
        interrupt as never
      );
    });

    await waitFor(() => expect(result.current.phase).toBe("paused"), {
      timeout: 3000,
    });
    expect(result.current.hitl.current?.interrupt_id).toBe("irq-plan-b");
    expect(continueHits).toBe(0);
    expect(
      result.current.transcript.entries.some(
        (e) =>
          e.kind === "system" &&
          e.text.includes("No pause left to approve")
      )
    ).toBe(false);
  });

  it("clears ghost pause card when server has no interrupt (offers Continue, no loop)", async () => {
    const interrupt = {
      interrupt_id: "irq-ghost",
      tier: "step",
      phase: "review",
      section_id: "quality_of_earnings",
      step_id: "distill_context",
      content: { evidence_bundle: { items: [] } },
      allowed_actions: ["approve", "edit", "reject"],
    };

    let mode: "ghost" | "orphan" = "ghost";
    let continueHits = 0;

    server.use(
      http.get("/sessions/t-ghost/status", () => {
        if (mode === "orphan") {
          return HttpResponse.json({
            run_status: "generating",
            audit_status: "passed",
            current_section_index: 1,
          });
        }
        return HttpResponse.json({
          run_status: "awaiting_approval",
          audit_status: "passed",
          current_section_index: 1,
        });
      }),
      http.get("/sessions/t-ghost/state", () => {
        if (mode === "ghost") {
          return HttpResponse.json({
            values: {
              selected_sections: ["quality_of_earnings"],
              run_status: "awaiting_approval",
            },
            next: [],
            interrupt,
            section_state: {
              section_id: "quality_of_earnings",
              step_trace: ["gather_context", "distill_context"],
            },
          });
        }
        return HttpResponse.json({
          values: {
            selected_sections: ["quality_of_earnings"],
            run_status: "generating",
          },
          next: ["run_section"],
          interrupt: null,
          section_state: {
            section_id: "quality_of_earnings",
            step_trace: ["gather_context", "distill_context"],
          },
        });
      }),
      http.post("/sessions/t-ghost/continue", async () => {
        continueHits += 1;
        return sseResponse("event: done\ndata: {}\n\n");
      })
    );

    const { result } = renderHook(() =>
      useRunOrchestrator("t-ghost", { pollMs: 80 })
    );

    await waitFor(() => expect(result.current.phase).toBe("paused"));
    expect(result.current.hitl.current?.interrupt_id).toBe("irq-ghost");

    mode = "orphan";

    await waitFor(() => expect(result.current.phase).toBe("needs_continue"), {
      timeout: 3000,
    });
    expect(result.current.hitl.current).toBeNull();
    expect(result.current.offerContinue).toBe(true);
    // Must not auto-loop /continue from the paused poll.
    expect(continueHits).toBe(0);
  });

  it("approve does not no-op while a prior continue is in flight", async () => {
    const interrupt = {
      interrupt_id: "irq-block",
      tier: "step",
      phase: "review",
      section_id: "quality_of_earnings",
      step_id: "draft",
      content: { draft: "Draft" },
      allowed_actions: ["approve"],
    };
    const nextInterrupt = {
      ...interrupt,
      interrupt_id: "irq-after",
      content: { draft: "After" },
    };

    let resumeHits = 0;
    let releaseContinue: (() => void) | null = null;
    const continueGate = new Promise<void>((resolve) => {
      releaseContinue = resolve;
    });

    server.use(
      http.get("/sessions/t-noblock/status", () =>
        HttpResponse.json({
          run_status: "awaiting_approval",
          audit_status: "passed",
          current_section_index: 0,
        })
      ),
      http.get("/sessions/t-noblock/state", () =>
        HttpResponse.json({
          values: { run_status: "awaiting_approval" },
          next: [],
          interrupt,
          section_state: null,
        })
      ),
      http.post("/sessions/t-noblock/continue", async () => {
        await continueGate;
        return sseResponse(
          `event: interrupt\ndata: ${JSON.stringify(interrupt)}\n\n`
        );
      }),
      http.post("/sessions/t-noblock/resume", async () => {
        resumeHits += 1;
        return sseResponse(
          `event: interrupt\ndata: ${JSON.stringify(nextInterrupt)}\n\n`
        );
      })
    );

    const { result } = renderHook(() =>
      useRunOrchestrator("t-noblock", { pollMs: 60_000 })
    );
    await waitFor(() => expect(result.current.phase).toBe("paused"));

    // Start a hung Continue, then Approve must still POST /resume (abort Continue).
    act(() => {
      void result.current.continueFromCheckpoint();
    });
    await waitFor(() => expect(result.current.continuing).toBe(true));

    await act(async () => {
      result.current.resumeRun(
        { action: "approve", interrupt_id: "irq-block" },
        interrupt as never
      );
    });

    await waitFor(() => expect(resumeHits).toBe(1), { timeout: 3000 });
    releaseContinue?.();
  });

  it("approve 409 with no interrupt auto-continues once", async () => {
    const interrupt = {
      interrupt_id: "irq-gone",
      tier: "global",
      phase: "review",
      section_id: null,
      step_id: null,
      content: { global_plan: { content: "G" } },
      allowed_actions: ["approve"],
    };
    const nextInterrupt = {
      ...interrupt,
      interrupt_id: "irq-next",
      content: { global_plan: { content: "Next" } },
    };

    let continueHits = 0;
    let mode: "paused" | "orphaned" | "recovered" = "paused";

    server.use(
      http.get("/sessions/t-409-orphan/status", () => {
        if (mode === "orphaned") {
          return HttpResponse.json({
            run_status: "generating",
            audit_status: "passed",
            current_section_index: 0,
          });
        }
        return HttpResponse.json({
          run_status: "awaiting_approval",
          audit_status: "passed",
          current_section_index: 0,
        });
      }),
      http.get("/sessions/t-409-orphan/state", () => {
        if (mode === "paused") {
          return HttpResponse.json({
            values: { run_status: "awaiting_approval" },
            next: [],
            interrupt,
            section_state: null,
          });
        }
        if (mode === "recovered") {
          return HttpResponse.json({
            values: { run_status: "awaiting_approval" },
            next: [],
            interrupt: nextInterrupt,
            section_state: null,
          });
        }
        return HttpResponse.json({
          values: { run_status: "generating" },
          next: ["run_section"],
          interrupt: null,
          section_state: null,
        });
      }),
      http.post("/sessions/t-409-orphan/resume", () => {
        mode = "orphaned";
        return HttpResponse.json(
          { detail: "No pending interrupt on this thread; use /continue" },
          { status: 409 }
        );
      }),
      http.post("/sessions/t-409-orphan/continue", async () => {
        continueHits += 1;
        mode = "recovered";
        return sseResponse(
          `event: interrupt\ndata: ${JSON.stringify(nextInterrupt)}\n\n`
        );
      })
    );

    const { result } = renderHook(() =>
      useRunOrchestrator("t-409-orphan", { pollMs: 60_000 })
    );

    await waitFor(() => expect(result.current.phase).toBe("paused"));

    await act(async () => {
      result.current.resumeRun(
        { action: "approve", interrupt_id: "irq-gone" },
        interrupt as never
      );
    });

    await waitFor(() => expect(continueHits).toBe(1), { timeout: 3000 });
    await waitFor(() => expect(result.current.phase).toBe("paused"), {
      timeout: 3000,
    });
    expect(result.current.hitl.current?.interrupt_id).toBe("irq-next");
  });

  it("approve 409 with interrupt present does not continue", async () => {
    const interrupt = {
      interrupt_id: "irq-stale",
      tier: "section",
      phase: "plan",
      section_id: "business_overview",
      step_id: null,
      content: { section_plan: "Old" },
      allowed_actions: ["approve"],
    };
    const current = {
      ...interrupt,
      interrupt_id: "irq-current",
      content: { section_plan: "Current" },
    };

    let continueHits = 0;

    server.use(
      http.get("/sessions/t-409-irq/status", () =>
        HttpResponse.json({
          run_status: "awaiting_approval",
          audit_status: "passed",
          current_section_index: 0,
        })
      ),
      http.get("/sessions/t-409-irq/state", () =>
        HttpResponse.json({
          values: { run_status: "awaiting_approval" },
          next: [],
          interrupt: current,
          section_state: null,
        })
      ),
      http.post("/sessions/t-409-irq/resume", () =>
        HttpResponse.json(
          { detail: "Interrupt already answered or stale." },
          { status: 409 }
        )
      ),
      http.post("/sessions/t-409-irq/continue", async () => {
        continueHits += 1;
        return sseResponse("event: done\ndata: {}\n\n");
      })
    );

    const { result } = renderHook(() =>
      useRunOrchestrator("t-409-irq", { pollMs: 60_000 })
    );

    await waitFor(() => expect(result.current.phase).toBe("paused"));

    await act(async () => {
      result.current.resumeRun(
        { action: "approve", interrupt_id: "irq-stale" },
        interrupt as never
      );
    });

    await waitFor(() =>
      expect(result.current.hitl.current?.interrupt_id).toBe("irq-current")
    );
    expect(continueHits).toBe(0);
    expect(result.current.phase).toBe("paused");
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
          return HttpResponse.json(
            { detail: "Unknown thread — no run state." },
            { status: 404 }
          );
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
    expect(result.current.instructionError).toMatch(/Unknown session|no run/i);
  });
});
