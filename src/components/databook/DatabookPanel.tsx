import { useCallback, useRef, useState } from "react";
import {
  ACCEPTED_DATABOOK_EXTENSIONS,
  useDocumentIngestion,
} from "../../hooks/useDocumentIngestion";

const ACCEPT_ATTR = ACCEPTED_DATABOOK_EXTENSIONS.join(",");

const STEPS: { id: string; label: string; match: string[] }[] = [
  { id: "uploaded", label: "Queued", match: ["uploaded"] },
  { id: "auditing", label: "Auditing workbook…", match: ["auditing"] },
  { id: "ingesting", label: "Extracting & indexing…", match: ["ingesting"] },
  { id: "ready", label: "Ready", match: ["ready"] },
];

function truncateRef(ref: string): string {
  if (ref.length <= 28) return ref;
  return `${ref.slice(0, 14)}…${ref.slice(-10)}`;
}

function glyph(kind: "todo" | "active" | "done" | "failed"): string {
  if (kind === "done") return "✓";
  if (kind === "active") return "◐";
  if (kind === "failed") return "✗";
  return "○";
}

function kindsForStatus(status: string | null): Array<"todo" | "active" | "done" | "failed"> {
  if (!status) return ["todo", "todo", "todo", "todo"];
  if (status === "failed") {
    return ["todo", "todo", "todo", "failed"];
  }
  const active = STEPS.findIndex((s) => s.match.includes(status));
  return STEPS.map((_, idx) => {
    if (active < 0) return "todo";
    if (idx < active) return "done";
    if (idx === active) return status === "ready" ? "done" : "active";
    return "todo";
  });
}

export type DatabookPanelProps = {
  threadId: string;
  initialDocumentRef?: string | null;
  onDocumentRef?: (documentRef: string) => void;
  onReadyChange?: (ready: boolean, documentRef: string | null) => void;
  /** Override poll interval (tests). Default 1500ms. */
  pollIntervalMs?: number;
};

export default function DatabookPanel({
  threadId,
  initialDocumentRef = null,
  onDocumentRef,
  onReadyChange,
  pollIntervalMs,
}: DatabookPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const ingestion = useDocumentIngestion({
    threadId,
    initialDocumentRef,
    onDocumentRef,
    onReady: (ref) => onReadyChange?.(true, ref),
    onFailed: () => onReadyChange?.(false, null),
    pollIntervalMs,
  });

  const onFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void ingestion.upload(file);
    },
    [ingestion]
  );

  const kinds = kindsForStatus(ingestion.status);
  const showStepper = Boolean(ingestion.status) || ingestion.uploading;
  const failed = ingestion.phase === "failed";

  return (
    <section className="databook-panel" aria-label="Databook">
      <header className="databook-panel__head">
        <h2 className="databook-panel__title">Databook</h2>
        {ingestion.ready && (
          <span className="status-chip status-chip--complete">Ready for generation</span>
        )}
      </header>

      <div
        className={`databook-dropzone${dragging ? " databook-dropzone--active" : ""}${
          ingestion.uploading ? " databook-dropzone--busy" : ""
        }`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!ingestion.uploading) onFiles(e.dataTransfer.files);
        }}
      >
        <p className="databook-dropzone__lead">
          {ingestion.uploading
            ? "Uploading…"
            : ingestion.ready
              ? "Databook ingested"
              : "Drop an Excel databook here"}
        </p>
        <p className="databook-dropzone__hint">{ACCEPTED_DATABOOK_EXTENSIONS.join(", ")}</p>
        <button
          type="button"
          className="btn-secondary"
          disabled={ingestion.uploading}
          onClick={() => inputRef.current?.click()}
        >
          {ingestion.ready || failed ? "Upload another" : "Choose file"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          hidden
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {(ingestion.fileName || ingestion.documentRef) && (
        <div className="databook-meta">
          {ingestion.fileName && (
            <p>
              <span className="databook-meta__label">File</span> {ingestion.fileName}
            </p>
          )}
          {ingestion.documentRef && (
            <p title={ingestion.documentRef}>
              <span className="databook-meta__label">Ref</span>{" "}
              <code>{truncateRef(ingestion.documentRef)}</code>
            </p>
          )}
          {ingestion.auditStatus && (
            <p>
              <span className="databook-meta__label">Audit</span> {ingestion.auditStatus}
            </p>
          )}
        </div>
      )}

      {showStepper && (
        <ol className="databook-stepper" aria-label="Ingestion progress">
          {STEPS.map((step, idx) => {
            const kind = failed && idx === 3 ? "failed" : kinds[idx];
            const label = kind === "failed" ? "Failed" : step.label;
            return (
              <li
                key={step.id}
                className={`databook-step databook-step--${kind}`}
                aria-current={kind === "active" ? "step" : undefined}
              >
                <span className="databook-step__icon" aria-hidden>
                  {glyph(kind)}
                </span>
                <span className="databook-step__label">{label}</span>
              </li>
            );
          })}
        </ol>
      )}

      {failed && (
        <div className="databook-error" role="alert">
          <p>{ingestion.error ?? "Ingestion failed."}</p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              ingestion.resetForRetry();
              onReadyChange?.(false, null);
            }}
          >
            Try again
          </button>
        </div>
      )}
    </section>
  );
}
