import type { ErrorEntry } from "../../types";
import { esc } from "../../utils/badges";

interface ErrorDetailsProps {
  error: ErrorEntry | null;
}

export default function ErrorDetails({ error: e }: ErrorDetailsProps) {
  if (!e) {
    return (
      <div className="detail-section" id="errorInfo">
        <h3>Error Details</h3>
        <div id="errorDetails" style={{ color: "var(--text-dim)", fontSize: 13 }}>
          Select an error to view details
        </div>
      </div>
    );
  }

  return (
    <div className="detail-section" id="errorInfo">
      <h3>Error Details</h3>
      <div id="errorDetails">
        <div className="detail-row">
          <span className="detail-label">Location</span>
          <span className="detail-value">{esc(e.full_address)}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Type</span>
          <span className="detail-value">
            {esc(e.error_category)} ({esc(e.severity || "")})
          </span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Formula</span>
          <span className="detail-value">{esc(e.formula || "N/A")}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Cached Val</span>
          <span className="detail-value">{esc(String(e.cached_value ?? "N/A"))}</span>
        </div>
        {e.root_cause_cell && (
          <div className="detail-row">
            <span className="detail-label">Root Cause</span>
            <span className="detail-value" style={{ color: "var(--error-red)" }}>
              {esc(e.root_cause_cell)}
            </span>
          </div>
        )}
        {e.downstream_impact && e.downstream_impact.length > 0 && (
          <div className="detail-row">
            <span className="detail-label">Impact</span>
            <span className="detail-value">{e.downstream_impact.length} downstream cells</span>
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
          {esc(e.explanation || "")}
        </div>
        {e.context && (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
            {e.context.row_label && (
              <div className="detail-row">
                <span className="detail-label">Row label</span>
                <span className="detail-value">{esc(e.context.row_label)}</span>
              </div>
            )}
            {e.context.col_header && (
              <div className="detail-row">
                <span className="detail-label">Col header</span>
                <span className="detail-value">{esc(e.context.col_header)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
