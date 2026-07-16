import { useCallback, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import DatabookPanel from "./DatabookPanel";
import {
  clearSessionsForTests,
  createLocalSession,
  loadSessions,
  patchSession,
  upsertSession,
} from "../../stores/sessionStore";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  clearSessionsForTests();
});
afterAll(() => server.close());
beforeEach(() => clearSessionsForTests());

function renderRun(threadId: string) {
  return render(
    <MemoryRouter>
      <RunShell threadId={threadId} />
    </MemoryRouter>
  );
}

/** Mirrors RunPage Start gate + documentRef persistence. */
function RunShell({ threadId }: { threadId: string }) {
  const [ready, setReady] = useState(false);
  const onDocumentRef = useCallback(
    (ref: string) => {
      patchSession(threadId, { documentRef: ref });
    },
    [threadId]
  );

  return (
    <div>
      <button type="button" disabled={!ready}>
        Start generation
      </button>
      <DatabookPanel
        threadId={threadId}
        onDocumentRef={onDocumentRef}
        onReadyChange={(isReady) => setReady(isReady)}
        pollIntervalMs={20}
      />
    </div>
  );
}

describe("DatabookPanel + Start gate", () => {
  it("gates Start until ingestion is ready and persists documentRef", async () => {
    const user = userEvent.setup();
    let polls = 0;
    server.use(
      http.post("/documents", () => HttpResponse.json({ document_ref: "slug-abc123" })),
      http.get("/documents/slug-abc123/status", () => {
        polls += 1;
        if (polls === 1) {
          return HttpResponse.json({ status: "ingesting", audit_status: "passed" });
        }
        return HttpResponse.json({ status: "ready", audit_status: "passed" });
      })
    );

    upsertSession(createLocalSession("thread-1"));
    renderRun("thread-1");

    const start = screen.getByRole("button", { name: /start generation/i });
    expect(start).toBeDisabled();

    const file = new File(["xlsx"], "sample_databook.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText(/ready for generation/i)).toBeInTheDocument();
      expect(start).toBeEnabled();
    });

    expect(loadSessions()[0]?.documentRef).toBe("slug-abc123");
  });

  it("shows failed UI with Review errors when audit_id is present", async () => {
    server.use(
      http.post("/documents", () => HttpResponse.json({ document_ref: "doc-fail" })),
      http.get("/documents/doc-fail/status", () =>
        HttpResponse.json({
          status: "failed",
          audit_status: "failed",
          error: "Audit failed: critical error",
          audit_id: "doc-fail",
        })
      )
    );

    upsertSession(createLocalSession("thread-1"));
    const user = userEvent.setup();
    renderRun("thread-1");

    const file = new File(["xlsx"], "bad.xlsx");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/audit failed/i);
    });
    expect(screen.getByRole("button", { name: /start generation/i })).toBeDisabled();
    expect(screen.getByRole("link", { name: /review errors/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/review/doc-fail")
    );
    const skip = screen.getByRole("button", { name: /skip & ingest/i });
    expect(skip).toHaveAttribute(
      "title",
      expect.stringMatching(/not fully resolved/i)
    );
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("shows percent progress while ingesting", async () => {
    const user = userEvent.setup();
    let polls = 0;
    server.use(
      http.post("/documents", () => HttpResponse.json({ document_ref: "doc-prog" })),
      http.get("/documents/doc-prog/status", () => {
        polls += 1;
        if (polls < 3) {
          return HttpResponse.json({
            status: "ingesting",
            audit_status: "passed",
            progress_pct: 42,
            progress_message: "[12/40] Revenue: 3 table(s)",
            eta_seconds: 90,
          });
        }
        return HttpResponse.json({
          status: "ready",
          audit_status: "passed",
          progress_pct: 100,
          progress_message: "Ingestion complete",
        });
      })
    );

    upsertSession(createLocalSession("thread-1"));
    renderRun("thread-1");

    const file = new File(["xlsx"], "sample.xlsx");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
    });
    expect(screen.getByText(/42%/)).toBeInTheDocument();
    expect(screen.getByText(/\[12\/40\] Revenue/i)).toBeInTheDocument();
    expect(screen.getByText(/remaining/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/ready for generation/i)).toBeInTheDocument();
    });
  });
});
