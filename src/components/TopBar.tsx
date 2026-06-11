interface TopBarProps {
  progressPct: number;
  progressText: string;
  onUndo: () => void;
  onDownload: () => void;
  onSaveReport: () => void;
}

export default function TopBar({ progressPct, progressText, onUndo, onDownload, onSaveReport }: TopBarProps) {
  return (
    <div className="topbar">
      <h1>
        <span>&#x2B21;</span> Excel Auditor &mdash; Review Mode
      </h1>
      <div className="topbar-actions">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <span className="progress-text">{progressText}</span>
        <button type="button" className="topbar-btn" onClick={onUndo}>
          &#x21B6; Undo
        </button>
        <button type="button" className="topbar-btn" onClick={onDownload}>
          &#x2B07; Download
        </button>
        <button type="button" className="topbar-btn" onClick={onSaveReport}>
          &#x1F4BE; Save Report
        </button>
      </div>
    </div>
  );
}
