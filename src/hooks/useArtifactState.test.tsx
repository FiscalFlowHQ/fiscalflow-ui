import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import ArtifactPanel from "../components/artifacts/ArtifactPanel";
import {
  normalizeCompletedSections,
  normalizeCrossReview,
  normalizeFindings,
  normalizeSectionState,
} from "../components/artifacts/artifactModel";
import { SAMPLE_SESSION_STATE } from "../components/artifacts/fixtures/sessionState.sample";
import { useArtifactState } from "./useArtifactState";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("artifactModel", () => {
  it("normalizes sample session state payloads", () => {
    const sections = normalizeCompletedSections(
      SAMPLE_SESSION_STATE.values.completed_sections
    );
    const findings = normalizeFindings(SAMPLE_SESSION_STATE.values.prior_findings);
    const review = normalizeCrossReview(
      SAMPLE_SESSION_STATE.values.metadata?.cross_section_review
    );
    const sectionState = normalizeSectionState(SAMPLE_SESSION_STATE.section_state);

    expect(sections[0]?.id).toBe("business_overview");
    expect(findings[0]?.claim).toMatch(/ARR/);
    expect(review?.contradictions).toHaveLength(1);
    expect(sectionState?.evidence_bundle).toMatchObject({
      summary: expect.stringContaining("Top-10"),
    });
  });
});

describe("useArtifactState", () => {
  it("batches 100 rapid tokens without dropping text", async () => {
    const { result } = renderHook(() => useArtifactState({ threadId: "t-art", pollMs: 0 }));

    await act(async () => {
      for (let i = 0; i < 100; i++) {
        result.current.applyEvent({
          type: "token",
          text: `w${i} `,
          node: "draft.execute",
          namespace: [],
        });
      }
      // Flush rAF
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });

    expect(result.current.liveNode).toBe("draft.execute");
    expect(result.current.liveText).toContain("w0 ");
    expect(result.current.liveText).toContain("w99 ");
    expect(result.current.liveText.split(/\s+/).filter(Boolean)).toHaveLength(100);
  });

  it("hydrates sections/evidence/findings from GET /state", async () => {
    server.use(
      http.get("/sessions/t-art/state", () => HttpResponse.json(SAMPLE_SESSION_STATE))
    );

    const { result } = renderHook(() => useArtifactState({ threadId: "t-art", pollMs: 0 }));

    await act(async () => {
      await result.current.refreshState();
    });

    expect(result.current.completedSections).toHaveLength(1);
    expect(result.current.priorFindings[0]?.id).toBe("f-arr");
    expect(result.current.sectionState?.section_id).toBe("quality_of_earnings");
    expect(result.current.crossReview?.cross_references).toHaveLength(1);
  });

  it("loads report markdown via GET /document?format=md after done", async () => {
    server.use(
      http.get("/sessions/t-art/state", () =>
        HttpResponse.json({
          ...SAMPLE_SESSION_STATE,
          values: { ...SAMPLE_SESSION_STATE.values, run_status: "completed" },
          section_state: null,
        })
      ),
      http.get("/sessions/t-art/document", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("format")).toBe("md");
        return new HttpResponse("# Assembled FDD\n\nBody.", {
          headers: { "Content-Type": "text/markdown" },
        });
      })
    );

    const { result } = renderHook(() => useArtifactState({ threadId: "t-art", pollMs: 0 }));

    await act(async () => {
      result.current.applyEvent({ type: "done" });
    });

    await waitFor(() => {
      expect(result.current.reportMarkdown).toContain("Assembled FDD");
    });
    expect(result.current.runStatus).toBe("completed");
  });
});

describe("ArtifactPanel", () => {
  it("renders sections, evidence, and findings tabs from hook state", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/sessions/t-ui/state", () => HttpResponse.json(SAMPLE_SESSION_STATE))
    );

    const { result } = renderHook(() => useArtifactState({ threadId: "t-ui", pollMs: 0 }));
    await act(async () => {
      await result.current.refreshState();
    });

    const { rerender } = render(<ArtifactPanel artifacts={result.current} />);

    await user.click(screen.getByRole("tab", { name: "Sections" }));
    rerender(<ArtifactPanel artifacts={result.current} />);
    expect(screen.getByText(/Business Overview/i)).toBeInTheDocument();
    expect(document.querySelector(".artifact-pill--live")).toHaveTextContent("live");

    await user.click(screen.getByRole("tab", { name: "Evidence" }));
    rerender(<ArtifactPanel artifacts={result.current} />);
    expect(screen.getByText(/Evidence bundle/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Top-10 customers/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("tab", { name: "Findings" }));
    rerender(<ArtifactPanel artifacts={result.current} />);
    expect(screen.getByText(/Prior findings/i)).toBeInTheDocument();
    expect(screen.getByText(/Contradictions/i)).toBeInTheDocument();
  });
});
