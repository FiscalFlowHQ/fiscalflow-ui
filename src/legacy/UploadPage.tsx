import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadAudit } from "../api/client";

export default function UploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".xlsx")) {
        setError("Only .xlsx files are supported");
        return;
      }
      setError("");
      setLoading(true);
      setStatus(`Auditing ${file.name}… This may take a few minutes for large workbooks.`);
      try {
        const result = await uploadAudit(file);
        setStatus(`Found ${result.total_errors ?? 0} errors (${result.needs_review_count ?? 0} need review)`);
        navigate(`/review/${result.audit_id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
        setLoading(false);
        setStatus("");
      }
    },
    [navigate]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <div className="upload-page">
      <div className="upload-card">
        <h1>
          <span>&#x2B21;</span> FiscalFlow
        </h1>
        <p>Upload an Excel workbook to detect, trace, and fix reference errors.</p>
        <div
          className={`upload-dropzone${dragging ? " dragover" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !loading && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            disabled={loading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) processFile(file);
            }}
          />
          {loading ? (
            <>
              <div className="upload-spinner" />
              <div className="upload-status">{status}</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>&#x1F4C4;</div>
              <div style={{ fontWeight: 500 }}>Drop .xlsx here or click to browse</div>
              <div className="upload-status">Runs full error scan and dependency tracing</div>
            </>
          )}
        </div>
        {error && <div className="upload-error">{error}</div>}
      </div>
    </div>
  );
}
