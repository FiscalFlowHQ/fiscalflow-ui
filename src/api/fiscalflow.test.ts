import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "../api/http";
import * as api from "../api/fiscalflow";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("fiscalflow REST client", () => {
  it("checkHealth happy path", async () => {
    server.use(http.get("/health", () => HttpResponse.json({ status: "ok" })));
    await expect(api.checkHealth()).resolves.toEqual({ status: "ok" });
  });

  it("createSession happy path", async () => {
    server.use(
      http.post("/sessions", () => HttpResponse.json({ thread_id: "t-1" }))
    );
    await expect(api.createSession()).resolves.toEqual({ thread_id: "t-1" });
  });

  it("createSession maps 404 to ApiError", async () => {
    server.use(
      http.post("/sessions", () =>
        HttpResponse.json({ detail: "not found" }, { status: 404 })
      )
    );
    const err = await api.createSession().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, detail: "not found" });
  });

  it("listSections happy path", async () => {
    const payload = {
      sections: [
        {
          id: "business_overview",
          title: "Business Overview",
          order: 1,
          required_structure: ["company_profile"],
        },
      ],
    };
    server.use(http.get("/sections", () => HttpResponse.json(payload)));
    await expect(api.listSections()).resolves.toEqual(payload);
  });

  it("listSections 404", async () => {
    server.use(
      http.get("/sections", () =>
        HttpResponse.json({ detail: "Not Found" }, { status: 404 })
      )
    );
    await expect(api.listSections()).rejects.toMatchObject({ status: 404 });
  });

  it("uploadDocument posts multipart FormData (file + thread_id)", async () => {
    let contentType = "";
    server.use(
      http.post("/documents", ({ request }) => {
        contentType = request.headers.get("Content-Type") ?? "";
        // Avoid request.formData() — undici/jsdom File polyfill trips the multipart parser.
        return HttpResponse.json({ document_ref: "doc-1" });
      })
    );
    const file = new File(["xlsx"], "book.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await expect(api.uploadDocument("t-1", file)).resolves.toEqual({
      document_ref: "doc-1",
    });
    expect(contentType).toMatch(/multipart\/form-data/i);
    expect(contentType).not.toContain("application/json");
  });

  it("uploadDocument maps 413", async () => {
    server.use(
      http.post("/documents", () =>
        HttpResponse.json({ detail: "too large" }, { status: 413 })
      )
    );
    const file = new File(["x"], "book.xlsx");
    await expect(api.uploadDocument("t-1", file)).rejects.toMatchObject({
      status: 413,
      detail: "too large",
    });
  });

  it("getDocumentStatus happy + 404", async () => {
    server.use(
      http.get("/documents/doc-1/status", () =>
        HttpResponse.json({ status: "ready", audit_status: "passed", error: null })
      ),
      http.get("/documents/missing/status", () =>
        HttpResponse.json({ detail: "Unknown document_ref: 'missing'." }, { status: 404 })
      )
    );
    await expect(api.getDocumentStatus("doc-1")).resolves.toEqual({
      status: "ready",
      audit_status: "passed",
      error: null,
    });
    await expect(api.getDocumentStatus("missing")).rejects.toMatchObject({ status: 404 });
  });

  it("getSessionState happy path", async () => {
    const payload = {
      values: { run_status: "planning" },
      next: ["global_plan"],
      interrupt: null,
      section_state: null,
    };
    server.use(
      http.get("/sessions/t-1/state", () => HttpResponse.json(payload))
    );
    await expect(api.getSessionState("t-1")).resolves.toEqual(payload);
  });

  it("getSessionState 404", async () => {
    server.use(
      http.get("/sessions/missing/state", () =>
        HttpResponse.json({ detail: "missing" }, { status: 404 })
      )
    );
    await expect(api.getSessionState("missing")).rejects.toMatchObject({ status: 404 });
  });

  it("getSessionStatus happy path", async () => {
    server.use(
      http.get("/sessions/t-1/status", () =>
        HttpResponse.json({
          run_status: "generating",
          audit_status: "passed",
          current_section_index: 0,
        })
      )
    );
    await expect(api.getSessionStatus("t-1")).resolves.toEqual({
      run_status: "generating",
      audit_status: "passed",
      current_section_index: 0,
    });
  });

  it("sendInstruction happy + 400", async () => {
    server.use(
      http.post("/sessions/t-1/instruction", async ({ request }) => {
        const body = (await request.json()) as { text: string };
        if (!body.text.trim()) {
          return HttpResponse.json({ detail: "blank instruction" }, { status: 400 });
        }
        return HttpResponse.json({ ok: true, instruction_count: 1 });
      })
    );
    await expect(api.sendInstruction("t-1", "focus on EBITDA")).resolves.toEqual({
      ok: true,
      instruction_count: 1,
    });
    await expect(api.sendInstruction("t-1", "   ")).rejects.toMatchObject({ status: 400 });
  });

  it("cancelRun normalizes missing was_running from live BE", async () => {
    server.use(
      http.post("/sessions/legacy/cancel", () =>
        HttpResponse.json({ cancelled: true, run_status: "cancelled" })
      )
    );
    await expect(api.cancelRun("legacy")).resolves.toEqual({
      cancelled: true,
      was_running: true,
      run_status: "cancelled",
    });
  });

  it("cancelRun happy + 409", async () => {
    server.use(
      http.post("/sessions/t-1/cancel", () =>
        HttpResponse.json({
          cancelled: true,
          was_running: true,
          run_status: "cancelled",
        })
      ),
      http.post("/sessions/busy/cancel", () =>
        HttpResponse.json({ detail: "conflict" }, { status: 409 })
      )
    );
    await expect(api.cancelRun("t-1")).resolves.toEqual({
      cancelled: true,
      was_running: true,
      run_status: "cancelled",
    });
    await expect(api.cancelRun("busy")).rejects.toMatchObject({ status: 409 });
  });

  it("downloadDocument returns blob and maps 404", async () => {
    server.use(
      http.get("/sessions/t-1/document", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("format")).toBe("md");
        return new HttpResponse("# report", {
          headers: { "Content-Type": "text/markdown" },
        });
      }),
      http.get("/sessions/pending/document", () =>
        HttpResponse.json({ detail: "Run has not completed." }, { status: 404 })
      )
    );
    const blob = await api.downloadDocument("t-1", "md");
    expect(await blob.text()).toBe("# report");
    await expect(api.downloadDocument("pending")).rejects.toMatchObject({ status: 404 });
  });

  it("downloadDocument maps 422 unknown format", async () => {
    server.use(
      http.get("/sessions/t-1/document", () =>
        HttpResponse.json({ detail: "Unknown format 'exe'." }, { status: 422 })
      )
    );
    // Cast for the error-path test only — DocumentFormat is closed at the type level.
    await expect(
      api.downloadDocument("t-1", "exe" as "md")
    ).rejects.toMatchObject({ status: 422 });
  });

  it("getProviderSettings + setProviderSettings", async () => {
    server.use(
      http.get("/settings/providers", () =>
        HttpResponse.json({
          provider: null,
          model: null,
          available_providers: [
            { provider: "openai", default_model: "gpt-4o", key_present: true },
          ],
        })
      ),
      http.put("/settings/providers", async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json(body);
      })
    );
    await expect(api.getProviderSettings()).resolves.toMatchObject({
      available_providers: [{ provider: "openai", key_present: true }],
    });
    await expect(api.setProviderSettings({ provider: "openai", model: "gpt-4o" })).resolves.toEqual(
      { provider: "openai", model: "gpt-4o" }
    );
  });

  it("parses FastAPI validation detail arrays", async () => {
    server.use(
      http.put("/settings/providers", () =>
        HttpResponse.json(
          {
            detail: [{ loc: ["body", "provider"], msg: "Field required", type: "missing" }],
          },
          { status: 422 }
        )
      )
    );
    await expect(api.setProviderSettings({ provider: "" })).rejects.toMatchObject({
      status: 422,
      detail: "Field required",
    });
  });
});
