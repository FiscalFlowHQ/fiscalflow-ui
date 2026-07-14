import { describe, expect, it } from "vitest";
import { runStatusBadge } from "./runStatusBadge";

describe("runStatusBadge", () => {
  it("returns Draft when never started", () => {
    expect(runStatusBadge({})).toEqual({ key: "draft", label: "Draft" });
    expect(runStatusBadge({ lastRunStatus: null })).toEqual({
      key: "draft",
      label: "Draft",
    });
  });

  it("returns Running for in-flight statuses without interrupt", () => {
    expect(runStatusBadge({ lastRunStatus: "generating" })).toEqual({
      key: "running",
      label: "Running",
    });
    expect(runStatusBadge({ lastRunStatus: "awaiting_approval", paused: false })).toEqual({
      key: "running",
      label: "Running",
    });
  });

  it("prefers Awaiting review when paused (interrupt present)", () => {
    expect(
      runStatusBadge({ lastRunStatus: "generating", paused: true })
    ).toEqual({ key: "awaiting_review", label: "Awaiting review" });
  });

  it("maps terminal statuses", () => {
    expect(runStatusBadge({ lastRunStatus: "completed" })).toEqual({
      key: "complete",
      label: "Complete",
    });
    expect(runStatusBadge({ lastRunStatus: "failed" })).toEqual({
      key: "failed",
      label: "Failed",
    });
    expect(runStatusBadge({ lastRunStatus: "cancelled" })).toEqual({
      key: "cancelled",
      label: "Cancelled",
    });
  });
});
