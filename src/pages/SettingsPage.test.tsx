import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import SettingsPage from "../pages/SettingsPage";
import { clearSettingsForTests, loadSettings } from "../stores/settingsStore";

const server = setupServer(
  http.get("/settings/providers", () =>
    HttpResponse.json({
      provider: "zai",
      model: "glm-4.6",
      available_providers: [
        { provider: "zai", default_model: "glm-4.6", key_present: true },
        { provider: "openai", default_model: "gpt-4o", key_present: false },
      ],
    })
  ),
  http.put("/settings/providers", async ({ request }) => {
    const body = (await request.json()) as { provider: string; model?: string };
    return HttpResponse.json({ provider: body.provider, model: body.model ?? null });
  }),
  http.get("/health", () => HttpResponse.json({ status: "ok" }))
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  clearSettingsForTests();
});
afterAll(() => server.close());
beforeEach(() => clearSettingsForTests());

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  );
}

describe("SettingsPage", () => {
  it("loads providers with key badges and saves provider prefs", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Key configured")).toBeInTheDocument();
      expect(screen.getByText("Key missing")).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText(/default provider/i), "openai");
    await waitFor(() => {
      expect(screen.getByText(/Selected provider “openai”/i)).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText(/default provider/i), "zai");
    const model = screen.getByLabelText(/model \(optional\)/i);
    await user.clear(model);
    await user.type(model, "glm-4.7");
    await user.click(screen.getByRole("button", { name: /save provider/i }));

    await waitFor(() => {
      expect(screen.getByText(/Saved default provider/i)).toBeInTheDocument();
    });
  });

  it("saves connection settings and tests health via proxy URL", async () => {
    const user = userEvent.setup();
    renderPage();

    const urlInput = screen.getByPlaceholderText(/leave empty for vite proxy/i);
    await user.type(urlInput, "http://localhost:8000");
    await user.type(
      screen.getByPlaceholderText(/optional — match fiscalflow_api_token/i),
      "tok-1"
    );
    await user.click(screen.getByRole("button", { name: /save connection/i }));

    expect(loadSettings()).toMatchObject({
      apiBaseUrl: "http://localhost:8000",
      apiToken: "tok-1",
    });

    // Probe uses form values — empty base hits same-origin /health (MSW).
    await user.clear(urlInput);
    await user.click(screen.getByRole("button", { name: /test connection/i }));
    await waitFor(() => {
      expect(screen.getByText(/Connected/i)).toBeInTheDocument();
    });
  });
});
