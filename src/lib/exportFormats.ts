import type { DocumentFormat } from "../types/api";
import type { ReportMetadata } from "../types/api";

/**
 * Feature-detect downloadable formats from `GET /state → values.metadata.artifacts`.
 * Artifact keys are `markdown` | `pptx` | `pdf`; the download query uses `md` | `pptx` | `pdf`.
 */
export function availableExportFormats(
  artifacts: ReportMetadata["artifacts"] | null | undefined
): DocumentFormat[] {
  if (!artifacts || typeof artifacts !== "object") return [];
  const formats: DocumentFormat[] = [];
  if (typeof artifacts.markdown === "string" && artifacts.markdown) {
    formats.push("md");
  }
  if (typeof artifacts.pptx === "string" && artifacts.pptx) {
    formats.push("pptx");
  }
  if (typeof artifacts.pdf === "string" && artifacts.pdf) {
    formats.push("pdf");
  }
  return formats;
}

export function exportFormatLabel(format: DocumentFormat): string {
  switch (format) {
    case "md":
      return "Markdown";
    case "pptx":
      return "PowerPoint";
    case "pdf":
      return "PDF";
    default:
      return format;
  }
}

export function exportFilename(
  threadId: string,
  format: DocumentFormat
): string {
  const short = threadId.slice(0, 8) || "report";
  const ext = format === "md" ? "md" : format;
  return `fiscalflow-${short}.${ext}`;
}
