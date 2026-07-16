import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import RunComposer from "./RunComposer";

function renderComposer(ui: ReactElement) {
  return render(<MemoryRouter initialEntries={["/run/t-1"]}>{ui}</MemoryRouter>);
}

const server = setupServer(
  http.get("/sections", () =>
    HttpResponse.json({
      sections: [
        {
          id: "business_overview",
          title: "Business Overview",
          order: 1,
          required_structure: ["company_profile"],
        },
        {
          id: "quality_of_earnings",
          title: "Quality of Earnings",
          order: 3,
          required_structure: ["revenue_quality"],
        },
      ],
    })
  ),
  http.get("/settings/providers", () =>
    HttpResponse.json({
      provider: null,
      model: null,
      available_providers: [],
    })
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("RunComposer", () => {
  it("disables Start when databook is not ready", async () => {
    renderComposer(
      <RunComposer
        databookReady={false}
        documentRef={null}
        locked={false}
        starting={false}
        startError={null}
        onStart={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Business Overview")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /start generation/i })).toBeDisabled();
  });

  it("starts with selected sections, document_ref, and balanced policy", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderComposer(
      <RunComposer
        databookReady
        documentRef="doc-1"
        locked={false}
        starting={false}
        startError={null}
        onStart={onStart}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Quality of Earnings")).toBeInTheDocument();
    });

    // Deselect business_overview — leave QoE.
    await user.click(screen.getByRole("checkbox", { name: /business overview/i }));
    await user.click(screen.getByRole("button", { name: /start generation/i }));

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        selected_sections: ["quality_of_earnings"],
        document_ref: "doc-1",
        approval_policy: "balanced",
        auto_approve_plans: false,
      })
    );
  });

  it("sends auto_approve_plans when composer checkbox is checked", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderComposer(
      <RunComposer
        databookReady
        documentRef="doc-1"
        locked={false}
        starting={false}
        startError={null}
        onStart={onStart}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Quality of Earnings")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("checkbox", { name: /auto-approve plan gates/i })
    );
    await user.click(screen.getByRole("button", { name: /start generation/i }));

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        auto_approve_plans: true,
      })
    );
  });

  it("renders exactly the API catalog (no hardcoded extras)", async () => {
    server.use(
      http.get("/sections", () =>
        HttpResponse.json({
          sections: [
            {
              id: "only_one",
              title: "Only One",
              order: 9,
              required_structure: [],
            },
          ],
        })
      )
    );

    renderComposer(
      <RunComposer
        databookReady
        documentRef="doc-1"
        locked={false}
        starting={false}
        startError={null}
        onStart={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Only One")).toBeInTheDocument();
    });
    expect(screen.queryByText("Business Overview")).not.toBeInTheDocument();
    expect(screen.queryByText("Quality of Earnings")).not.toBeInTheDocument();
  });
});
