import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import App from "../App";
import { config, getAuthHeaders } from "../config/env";
import { clearSessionsForTests } from "../stores/sessionStore";

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
beforeEach(() => clearSessionsForTests());

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

describe("app shell routes", () => {
  it("renders HomePage with health indicator when backend responds", async () => {
    renderAt("/");
    expect(screen.getByRole("heading", { name: "FiscalFlow" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/backend online/i);
    });
    expect(screen.getByRole("button", { name: /new fdd run/i })).toBeEnabled();
  });

  it("shows offline health when /health fails", async () => {
    server.use(http.get("/health", () => HttpResponse.error()));
    renderAt("/");
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/backend offline/i);
    });
  });

  it("renders RunPage workspace for a thread id", async () => {
    renderAt("/run/thread-abc");
    expect(screen.getByRole("heading", { name: /FDD run/i })).toBeInTheDocument();
    expect(screen.getByText("thread-abc")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeDisabled();
    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: /breadcrumb/i })).toBeInTheDocument();
    });
  });

  it("renders Settings stub", () => {
    renderAt("/settings");
    expect(screen.getByRole("heading", { name: /settings/i })).toBeInTheDocument();
  });

  it("keeps legacy upload route compiling", () => {
    renderAt("/upload");
    expect(document.body.textContent).toBeTruthy();
  });
});

describe("config helpers", () => {
  it("exposes empty defaults for same-origin proxy", () => {
    expect(config.apiBaseUrl).toBe("");
    expect(getAuthHeaders()).toEqual({});
  });
});
