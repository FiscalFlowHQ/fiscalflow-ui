import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "./http";
import {
  decodeSseEvent,
  parseSseFixture,
  streamContinue,
  streamGeneration,
  streamResume,
  streamStart,
} from "./sse";
import type { SseEvent } from "../types/sse";

/**
 * Recorded-style fixture (mirrors `scripts/sse_client.py` event vocabulary).
 * Includes live-BE plain `token` text + target-contract JSON token.
 */
const FIXTURE = [
  "event: step",
  'data: {"node":"ingest","namespace":[]}',
  "",
  "event: step",
  'data: {"node":"distill_context.execute","namespace":["run_section:abc"]}',
  "",
  "event: token",
  "data: Revenue grew",
  "",
  "event: token",
  'data: {"text":" modestly.","node":"draft.execute","namespace":["run_section:abc"]}',
  "",
  "event: interrupt",
  'data: {"interrupt_id":"irq-1","tier":"global","phase":"review","section_id":null,"step_id":null,"content":{"global_plan":{"content":"# Plan"}},"allowed_actions":["approve","edit","reject"]}',
  "",
  // Should not be parsed — stream ends at interrupt
  "event: done",
  "data: {}",
  "",
].join("\n");

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("decodeSseEvent", () => {
  it("parses step events", () => {
    expect(decodeSseEvent("step", '{"node":"ingest","namespace":[]}')).toEqual({
      type: "step",
      node: "ingest",
      namespace: [],
    });
  });

  it("parses plain-text token (live BE) and JSON token (target)", () => {
    expect(decodeSseEvent("token", "hello")).toEqual({
      type: "token",
      text: "hello",
      node: "",
      namespace: [],
    });
    expect(
      decodeSseEvent("token", '{"text":"x","node":"draft.execute","namespace":["ns"]}')
    ).toEqual({
      type: "token",
      text: "x",
      node: "draft.execute",
      namespace: ["ns"],
    });
  });

  it("normalizes interrupt without interrupt_id", () => {
    const ev = decodeSseEvent(
      "interrupt",
      JSON.stringify({
        tier: "step",
        phase: "clarification",
        section_id: "quality_of_earnings",
        step_id: "gather_context",
        content: { open_questions: [] },
        allowed_actions: ["answer"],
      })
    );
    expect(ev).toMatchObject({
      type: "interrupt",
      interruptId: "",
      envelope: {
        interrupt_id: "",
        tier: "step",
        phase: "clarification",
        allowed_actions: ["answer"],
      },
    });
  });

  it("parses done and error", () => {
    expect(decodeSseEvent("done", "{}")).toEqual({ type: "done" });
    expect(decodeSseEvent("error", '{"message":"boom"}')).toEqual({
      type: "error",
      message: "boom",
    });
  });
});

describe("parseSseFixture", () => {
  it("replays recorded lines into SseEvent[] and stops at interrupt", () => {
    const events = parseSseFixture(FIXTURE);
    expect(events.map((e) => e.type)).toEqual([
      "step",
      "step",
      "token",
      "token",
      "interrupt",
    ]);
    expect(events[0]).toEqual({ type: "step", node: "ingest", namespace: [] });
    expect(events[2]).toEqual({ type: "token", text: "Revenue grew", node: "", namespace: [] });
    expect(events[3]).toMatchObject({
      type: "token",
      text: " modestly.",
      node: "draft.execute",
    });
    expect(events[4]).toMatchObject({
      type: "interrupt",
      interruptId: "irq-1",
    });
  });

  it("handles CRLF and partial multi-line data", () => {
    const crlf = [
      "event: error\r",
      'data: {"message":"failed"}\r',
      "\r",
    ].join("\n");
    expect(parseSseFixture(crlf)).toEqual([{ type: "error", message: "failed" }]);
  });
});

describe("streamGeneration", () => {
  it("streams start events via fetch reader", async () => {
    server.use(
      http.post("/sessions/t-1/start", async ({ request }) => {
        const body = await request.json();
        expect(body).toMatchObject({
          selected_sections: ["quality_of_earnings"],
          approval_policy: "balanced",
        });
        return new HttpResponse(FIXTURE, {
          headers: { "Content-Type": "text/event-stream" },
        });
      })
    );

    const events: SseEvent[] = [];
    let closed = false;
    await streamStart(
      "t-1",
      {
        selected_sections: ["quality_of_earnings"],
        approval_policy: "balanced",
      },
      {
        onEvent: (ev) => events.push(ev),
        onClose: () => {
          closed = true;
        },
      }
    );

    expect(events.map((e) => e.type)).toEqual([
      "step",
      "step",
      "token",
      "token",
      "interrupt",
    ]);
    expect(closed).toBe(true);
  });

  it("posts resume body and continue with no body", async () => {
    let resumeBody: unknown;
    let continueHadBody = true;

    server.use(
      http.post("/sessions/t-1/resume", async ({ request }) => {
        resumeBody = await request.json();
        return new HttpResponse("event: done\ndata: {}\n\n", {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
      http.post("/sessions/t-1/continue", async ({ request }) => {
        continueHadBody = (await request.text()).length > 0;
        return new HttpResponse("event: done\ndata: {}\n\n", {
          headers: { "Content-Type": "text/event-stream" },
        });
      })
    );

    await streamResume(
      "t-1",
      { action: "approve", interrupt_id: "irq-1" },
      { onEvent: () => undefined }
    );
    expect(resumeBody).toEqual({ action: "approve", interrupt_id: "irq-1" });

    await streamContinue("t-1", { onEvent: () => undefined });
    expect(continueHadBody).toBe(false);
  });

  it("throws ApiError on HTTP 409 before reading stream", async () => {
    server.use(
      http.post("/sessions/t-1/start", () =>
        HttpResponse.json(
          { detail: "A run is already active on this thread." },
          { status: 409 }
        )
      )
    );

    const err = await streamGeneration(
      "t-1",
      "start",
      { selected_sections: ["quality_of_earnings"] },
      { onEvent: () => undefined }
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 409,
      detail: "A run is already active on this thread.",
    });
  });

  it("honors AbortSignal", async () => {
    server.use(
      http.post("/sessions/t-1/start", async () => {
        await new Promise((r) => setTimeout(r, 5_000));
        return new HttpResponse("event: done\ndata: {}\n\n", {
          headers: { "Content-Type": "text/event-stream" },
        });
      })
    );

    const controller = new AbortController();
    const pending = streamStart(
      "t-1",
      { selected_sections: ["quality_of_earnings"] },
      { onEvent: () => undefined },
      controller.signal
    );
    controller.abort();
    await expect(pending).rejects.toSatisfy(
      (e: unknown) => e instanceof DOMException || (e instanceof Error && e.name === "AbortError")
    );
  });
});
