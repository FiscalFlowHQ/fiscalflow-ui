import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  INGESTION_POLL_MS,
  isAcceptedDatabookFile,
  useDocumentIngestion,
} from "./useDocumentIngestion";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => server.close());

function xlsxFile(name = "book.xlsx"): File {
  return new File(["fake-xlsx"], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("isAcceptedDatabookFile", () => {
  it("accepts BE extensions only", () => {
    expect(isAcceptedDatabookFile(xlsxFile())).toBe(true);
    expect(isAcceptedDatabookFile(xlsxFile("a.xlsm"))).toBe(true);
    expect(isAcceptedDatabookFile(new File(["x"], "a.csv"))).toBe(false);
  });
});

describe("useDocumentIngestion", () => {
  it("uploads then polls until ready", async () => {
    let polls = 0;
    server.use(
      http.post("/documents", () => HttpResponse.json({ document_ref: "doc-ready" })),
      http.get("/documents/doc-ready/status", () => {
        polls += 1;
        if (polls < 2) {
          return HttpResponse.json({ status: "auditing", audit_status: null });
        }
        return HttpResponse.json({ status: "ready", audit_status: "passed" });
      })
    );

    const onReady = vi.fn();
    const onDocumentRef = vi.fn();
    const { result } = renderHook(() =>
      useDocumentIngestion({
        threadId: "t-1",
        onReady,
        onDocumentRef,
        pollIntervalMs: 20,
      })
    );

    await act(async () => {
      await result.current.upload(xlsxFile("sample_databook.xlsx"));
    });

    expect(onDocumentRef).toHaveBeenCalledWith("doc-ready");
    await waitFor(() => {
      expect(result.current.ready).toBe(true);
      expect(result.current.status).toBe("ready");
      expect(result.current.auditStatus).toBe("passed");
    });
    expect(onReady).toHaveBeenCalledWith("doc-ready");
  });

  it("surfaces failed ingestion and stops polling", async () => {
    server.use(
      http.post("/documents", () => HttpResponse.json({ document_ref: "doc-bad" })),
      http.get("/documents/doc-bad/status", () =>
        HttpResponse.json({
          status: "failed",
          audit_status: "failed",
          error: "critical formula error",
          audit_id: "doc-bad",
        })
      )
    );

    const onFailed = vi.fn();
    const { result } = renderHook(() =>
      useDocumentIngestion({
        threadId: "t-1",
        onFailed,
        pollIntervalMs: 20,
      })
    );

    await act(async () => {
      await result.current.upload(xlsxFile());
    });

    await waitFor(() => {
      expect(result.current.phase).toBe("failed");
      expect(result.current.error).toBe("critical formula error");
      expect(result.current.auditId).toBe("doc-bad");
    });
    expect(onFailed).toHaveBeenCalled();
  });

  it("picks up a late initialDocumentRef and re-polls to ready", async () => {
    server.use(
      http.get("/documents/doc-restored/status", () =>
        HttpResponse.json({
          status: "ready",
          audit_status: "passed",
          progress_pct: 100,
        })
      )
    );

    const onReady = vi.fn();
    const { result, rerender } = renderHook(
      (props: { initialDocumentRef: string | null }) =>
        useDocumentIngestion({
          threadId: "t-1",
          initialDocumentRef: props.initialDocumentRef,
          onReady,
          pollIntervalMs: 20,
        }),
      { initialProps: { initialDocumentRef: null as string | null } }
    );

    expect(result.current.documentRef).toBeNull();

    rerender({ initialDocumentRef: "doc-restored" });

    await waitFor(() => {
      expect(result.current.documentRef).toBe("doc-restored");
      expect(result.current.ready).toBe(true);
    });
    expect(onReady).toHaveBeenCalledWith("doc-restored");
  });

  it("maps upload 413 to failed phase", async () => {
    server.use(
      http.post("/documents", () =>
        HttpResponse.json({ detail: "Payload too large" }, { status: 413 })
      )
    );

    const { result } = renderHook(() =>
      useDocumentIngestion({ threadId: "t-1", pollIntervalMs: 20 })
    );

    await act(async () => {
      await result.current.upload(xlsxFile());
    });

    expect(result.current.phase).toBe("failed");
    expect(result.current.error).toMatch(/size limit/i);
  });

  it("stops polling on unmount", async () => {
    let polls = 0;
    server.use(
      http.get("/documents/doc-poll/status", () => {
        polls += 1;
        return HttpResponse.json({ status: "ingesting" });
      })
    );

    const { unmount } = renderHook(() =>
      useDocumentIngestion({
        threadId: "t-1",
        initialDocumentRef: "doc-poll",
        pollIntervalMs: 30,
      })
    );

    await waitFor(() => expect(polls).toBeGreaterThanOrEqual(1));
    const atUnmount = polls;
    unmount();
    await new Promise((r) => setTimeout(r, INGESTION_POLL_MS));
    // Allow one in-flight response; no steady growth after unmount.
    expect(polls).toBeLessThanOrEqual(atUnmount + 1);
  });
});
