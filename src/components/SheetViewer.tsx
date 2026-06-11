import type { SheetData } from "../types";
import { esc } from "../utils/badges";

interface SheetViewerProps {
  data: SheetData | null;
  loading: boolean;
  preview?: boolean;
}

export default function SheetViewer({ data, loading, preview }: SheetViewerProps) {
  if (loading) {
    return (
      <div className="sheet-viewer">
        <div className="empty-state">
          <div>Loading sheet...</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="sheet-viewer" id="sheetViewer">
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
          <div>Select an error from the sidebar to begin</div>
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="sheet-viewer">
        <div className="empty-state">
          <div>{data.error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-viewer">
      <div className="sheet-viewer-header">
        <span className="sheet-tab">{data.sheet_name}</span>
        <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
          {preview ? (
            "Preview"
          ) : (
            <>
              Cell: <strong style={{ color: "var(--error-red)" }}>{data.center_cell}</strong>
              {data.formula && (
                <>
                  {" "}
                  &nbsp;|&nbsp; Formula: <code style={{ color: "var(--accent)" }}>{data.formula}</code>
                </>
              )}
            </>
          )}
        </span>
      </div>
      <div className="sheet-table-wrap">
        <table className="sheet-grid">
          <thead>
            <tr>
              <th />
              {data.headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row._row}>
                <td className="row-header">{row._row}</td>
                {row._cells.map((cell) => {
                  const cls = cell.is_target ? "target-cell" : cell.is_error ? "error-cell" : "";
                  return (
                    <td key={cell.coord} className={cls} title={cell.value}>
                      {esc(cell.value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
