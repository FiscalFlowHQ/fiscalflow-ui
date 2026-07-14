import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/http";
import { getDocumentStatus, uploadDocument } from "../api/fiscalflow";
import type { DocumentStatus } from "../types/api";

export const INGESTION_POLL_MS = 1500;

export const ACCEPTED_DATABOOK_EXTENSIONS = [".xlsx", ".xls", ".xlsm", ".xlsb"] as const;

export type IngestionUiPhase = "idle" | "uploading" | "polling" | "ready" | "failed";

export type UseDocumentIngestionOptions = {
  threadId: string;
  /** Resume polling after refresh when the session already has a ref. */
  initialDocumentRef?: string | null;
  onDocumentRef?: (documentRef: string) => void;
  onReady?: (documentRef: string) => void;
  onFailed?: (error: string | null) => void;
  pollIntervalMs?: number;
};

export type UseDocumentIngestionResult = {
  documentRef: string | null;
  fileName: string | null;
  status: DocumentStatus | string | null;
  auditStatus: string | null;
  error: string | null;
  phase: IngestionUiPhase;
  ready: boolean;
  uploading: boolean;
  upload: (file: File) => Promise<void>;
  /** Clear failed/ready UI so the user can pick another file. */
  resetForRetry: () => void;
};

export function isAcceptedDatabookFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_DATABOOK_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function phaseFromStatus(status: string | null, uploading: boolean): IngestionUiPhase {
  if (uploading) return "uploading";
  if (!status) return "idle";
  if (status === "ready") return "ready";
  if (status === "failed") return "failed";
  return "polling";
}

/**
 * Upload a databook and poll `GET /documents/{ref}/status` until ready/failed.
 * Polling stops on unmount and when `documentRef` changes.
 */
export function useDocumentIngestion(
  options: UseDocumentIngestionOptions
): UseDocumentIngestionResult {
  const {
    threadId,
    initialDocumentRef = null,
    onDocumentRef,
    onReady,
    onFailed,
    pollIntervalMs = INGESTION_POLL_MS,
  } = options;

  const [documentRef, setDocumentRef] = useState<string | null>(initialDocumentRef);
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<DocumentStatus | string | null>(null);
  const [auditStatus, setAuditStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const onDocumentRefRef = useRef(onDocumentRef);
  const onReadyRef = useRef(onReady);
  const onFailedRef = useRef(onFailed);
  onDocumentRefRef.current = onDocumentRef;
  onReadyRef.current = onReady;
  onFailedRef.current = onFailed;

  useEffect(() => {
    if (!documentRef || uploading) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function pollOnce() {
      if (cancelled || !documentRef) return;
      try {
        const res = await getDocumentStatus(documentRef);
        if (cancelled) return;
        setStatus(res.status);
        setAuditStatus(res.audit_status ?? null);
        setError(res.error ?? null);

        if (res.status === "ready") {
          onReadyRef.current?.(documentRef);
          return;
        }
        if (res.status === "failed") {
          onFailedRef.current?.(res.error ?? "Ingestion failed");
          return;
        }
        timer = setTimeout(() => {
          void pollOnce();
        }, pollIntervalMs);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : "Failed to poll document status";
        setError(message);
        setStatus("failed");
        onFailedRef.current?.(message);
      }
    }

    void pollOnce();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [documentRef, uploading, pollIntervalMs]);

  const upload = useCallback(
    async (file: File) => {
      if (!isAcceptedDatabookFile(file)) {
        setError(
          `Unsupported file type. Use ${ACCEPTED_DATABOOK_EXTENSIONS.join(", ")}.`
        );
        setStatus("failed");
        return;
      }

      setUploading(true);
      setError(null);
      setStatus("uploaded");
      setAuditStatus(null);
      setFileName(file.name);

      try {
        const { document_ref } = await uploadDocument(threadId, file);
        setDocumentRef(document_ref);
        onDocumentRefRef.current?.(document_ref);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : "Upload failed";
        setError(message);
        setStatus("failed");
        onFailedRef.current?.(message);
      } finally {
        setUploading(false);
      }
    },
    [threadId]
  );

  const resetForRetry = useCallback(() => {
    setDocumentRef(null);
    setFileName(null);
    setStatus(null);
    setAuditStatus(null);
    setError(null);
    setUploading(false);
  }, []);

  return {
    documentRef,
    fileName,
    status,
    auditStatus,
    error,
    phase: phaseFromStatus(status, uploading),
    ready: status === "ready",
    uploading,
    upload,
    resetForRetry,
  };
}
