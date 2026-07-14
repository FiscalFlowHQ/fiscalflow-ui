import { describe, expect, it } from "vitest";
import {
  availableExportFormats,
  exportFilename,
  exportFormatLabel,
} from "./exportFormats";

describe("availableExportFormats", () => {
  it("maps metadata.artifacts keys to download query formats", () => {
    expect(
      availableExportFormats({
        markdown: "/tmp/report.md",
        pptx: "/tmp/report.pptx",
      })
    ).toEqual(["md", "pptx"]);
    expect(availableExportFormats({ pdf: "/tmp/a.pdf" })).toEqual(["pdf"]);
    expect(availableExportFormats({})).toEqual([]);
    expect(availableExportFormats(null)).toEqual([]);
  });

  it("labels and filenames", () => {
    expect(exportFormatLabel("md")).toBe("Markdown");
    expect(exportFilename("abcdefghijklmn", "pptx")).toBe(
      "fiscalflow-abcdefgh.pptx"
    );
  });
});
