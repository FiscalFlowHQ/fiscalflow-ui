import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import App from "../App";
import { clearSessionsForTests, createLocalSession, upsertSession } from "../stores/sessionStore";

const server = setupServer(
  http.get("/health", () => HttpResponse.json({ status: "ok" })),
  http.get("/sections", () =>
    HttpResponse.json({
      sections: [
        {
          id: "business_overview",
          title: "Business Overview",
          order: 1,
          required_structure: [],
        },
      ],
    })
  ),
  http.get("/settings/providers", () =>
    HttpResponse.json({ provider: null, model: null, available_providers: [] })
  ),
  http.get("/sessions/:id/status", () =>
    HttpResponse.json({
      run_status: null,
      audit_status: null,
      current_section_index: null,
    })
  ),
  http.get("/sessions/:id/state", () =>
    HttpResponse.json({ values: {}, next: [], interrupt: null, section_state: null })
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  clearSessionsForTests();
});
afterAll(() => server.close());

beforeEach(() => {
  clearSessionsForTests();
});

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>
  );
}

describe("HomePage sessions", () => {
  it("shows empty state and enables New FDD run when backend is up", async () => {
    renderHome();
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/backend online/i);
    });
    expect(screen.getByText(/no fdd runs yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new fdd run/i })).toBeEnabled();
  });

  it("creates a session, persists it, and navigates to the run page", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/sessions", () => HttpResponse.json({ thread_id: "new-thread-1" }))
    );

    renderHome();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /new fdd run/i })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: /new fdd run/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /FDD run/i })).toBeInTheDocument();
      expect(screen.getByText("new-thread-1")).toBeInTheDocument();
    });

    expect(JSON.parse(localStorage.getItem("fiscalflow.sessions.v1") ?? "[]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ threadId: "new-thread-1" }),
      ])
    );
  });

  it("lists persisted sessions and refreshes awaiting-review badge", async () => {
    upsertSession({
      ...createLocalSession("paused-1", "Paused run"),
      lastRunStatus: null,
      paused: false,
    });

    server.use(
      http.get("/sessions/paused-1/status", () =>
        HttpResponse.json({
          run_status: "generating",
          audit_status: "passed",
          current_section_index: 0,
        })
      ),
      http.get("/sessions/paused-1/state", () =>
        HttpResponse.json({
          values: { run_status: "generating" },
          next: [],
          interrupt: {
            interrupt_id: "irq-1",
            tier: "global",
            phase: "review",
            section_id: null,
            step_id: null,
            content: {},
            allowed_actions: ["approve"],
          },
          section_state: null,
        })
      )
    );

    renderHome();

    await waitFor(() => {
      expect(screen.getByText("Paused run")).toBeInTheDocument();
      expect(screen.getByText("Awaiting review")).toBeInTheDocument();
    });
  });

  it("opens an existing session on click", async () => {
    const user = userEvent.setup();
    upsertSession(createLocalSession("open-me", "Open me"));

    renderHome();
    await waitFor(() => {
      expect(screen.getByText("Open me")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Open Open me" }));

    await waitFor(() => {
      expect(screen.getByText("open-me")).toBeInTheDocument();
    });
  });

  it("disables New FDD run when backend is offline", async () => {
    server.use(http.get("/health", () => HttpResponse.error()));
    renderHome();
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/backend offline/i);
    });
    expect(screen.getByRole("button", { name: /new fdd run/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/backend is offline/i);
  });
});
