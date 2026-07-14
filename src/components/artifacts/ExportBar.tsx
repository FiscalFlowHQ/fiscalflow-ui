import type { DocumentFormat } from "../../types/api";
import { exportFormatLabel } from "../../lib/exportFormats";

export type ExportBarProps = {
  formats: DocumentFormat[];
  busyFormat: DocumentFormat | null;
  error: string | null;
  onExport: (format: DocumentFormat) => void;
  onRefresh?: () => void;
  /** Run finished but no artifact keys yet. */
  awaitingArtifacts?: boolean;
};

export default function ExportBar({
  formats,
  busyFormat,
  error,
  onExport,
  onRefresh,
  awaitingArtifacts = false,
}: ExportBarProps) {
  if (awaitingArtifacts && formats.length === 0) {
    return (
      <div className="export-bar" role="status">
        <p className="export-bar__hint">
          Run completed — waiting for server artifacts. Refresh state if exports do not
          appear (PPTX/PDF only when the API produced them).
        </p>
        {onRefresh && (
          <button type="button" className="btn-secondary" onClick={onRefresh}>
            Refresh artifacts
          </button>
        )}
        {error && (
          <p className="export-bar__error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (formats.length === 0) {
    return null;
  }

  return (
    <div className="export-bar" aria-label="Export report">
      <p className="export-bar__label">Export</p>
      <div className="export-bar__actions">
        {formats.map((format) => (
          <button
            key={format}
            type="button"
            className="btn-secondary"
            disabled={busyFormat != null}
            onClick={() => onExport(format)}
          >
            {busyFormat === format
              ? `Downloading ${exportFormatLabel(format)}…`
              : `Download ${exportFormatLabel(format)}`}
          </button>
        ))}
      </div>
      {error && (
        <p className="export-bar__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
