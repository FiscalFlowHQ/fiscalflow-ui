import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import App from "../App";
import { config } from "../config/env";
import { getAuthHeaders } from "../config/env";

const server = setupServer(
  http.get("/health", () => HttpResponse.json({ status: "ok" }))
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

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
    expect(screen.getByRole("button", { name: /new fdd run/i })).toBeDisabled();
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/backend online/i);
    });
  });

  it("shows offline health when /health fails", async () => {
    server.use(http.get("/health", () => HttpResponse.error()));
    renderAt("/");
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/backend offline/i);
    });
  });

  it("renders RunPage stub for a thread id", () => {
    renderAt("/run/thread-abc");
    expect(screen.getByRole("heading", { name: /run workspace/i })).toBeInTheDocument();
    expect(screen.getByText("thread-abc")).toBeInTheDocument();
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
