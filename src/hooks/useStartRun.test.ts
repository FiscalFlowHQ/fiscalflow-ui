import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useSectionCatalog } from "./useSectionCatalog";
import { useStartRun } from "./useStartRun";

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

describe("useSectionCatalog", () => {
  it("loads and sorts sections by sparse order", async () => {
    server.use(
      http.get("/sections", () =>
        HttpResponse.json({
          sections: [
            {
              id: "quality_of_earnings",
              title: "Quality of Earnings",
              order: 3,
              required_structure: ["revenue_quality"],
            },
            {
              id: "business_overview",
              title: "Business Overview",
              order: 1,
              required_structure: ["company_profile"],
            },
          ],
        })
      )
    );

    const { result } = renderHook(() => useSectionCatalog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sections.map((s) => s.id)).toEqual([
      "business_overview",
      "quality_of_earnings",
    ]);
  });

  it("surfaces 404 without inventing a hardcoded catalog", async () => {
    server.use(
      http.get("/sections", () =>
        HttpResponse.json({ detail: "Not Found" }, { status: 404 })
      )
    );
    const { result } = renderHook(() => useSectionCatalog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sections).toEqual([]);
    expect(result.current.error).toMatch(/GET \/sections/i);
  });
});

describe("useStartRun", () => {
  it("streams start and marks paused on interrupt", async () => {
    server.use(
      http.post("/sessions/t-1/start", async ({ request }) => {
        const body = await request.json();
        expect(body).toMatchObject({
          selected_sections: ["quality_of_earnings"],
          approval_policy: "balanced",
          document_ref: "doc-1",
        });
        return sseResponse(
          [
            'event: step',
            'data: {"node":"ingest","namespace":[]}',
            "",
            "event: interrupt",
            'data: {"interrupt_id":"irq-1","tier":"global","phase":"review","section_id":null,"step_id":null,"content":{},"allowed_actions":["approve"]}',
            "",
          ].join("\n")
        );
      })
    );

    const onEvent = vi.fn();
    const { result } = renderHook(() =>
      useStartRun({ threadId: "t-1", onEvent })
    );

    await act(async () => {
      await result.current.start({
        selected_sections: ["quality_of_earnings"],
        document_ref: "doc-1",
        approval_policy: "balanced",
      });
    });

    expect(result.current.phase).toBe("paused");
    expect(result.current.locked).toBe(true);
    expect(onEvent).toHaveBeenCalled();
  });

  it("maps HTTP 409 to a recovery-oriented error", async () => {
    server.use(
      http.post("/sessions/t-1/start", () =>
        HttpResponse.json(
          { detail: "A run is already active on this thread." },
          { status: 409 }
        )
      )
    );

    const { result } = renderHook(() => useStartRun({ threadId: "t-1" }));
    await act(async () => {
      await result.current.start({
        selected_sections: ["business_overview"],
        document_ref: "doc-1",
      });
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.error).toMatch(/already active/i);
    expect(result.current.locked).toBe(false);
  });

  it("rejects empty sections client-side", async () => {
    const { result } = renderHook(() => useStartRun({ threadId: "t-1" }));
    await act(async () => {
      await result.current.start({
        selected_sections: [],
        document_ref: "doc-1",
      });
    });
    expect(result.current.phase).toBe("error");
    expect(result.current.error).toMatch(/at least one section/i);
  });
});
