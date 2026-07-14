/**
 * Non-streaming fiscalflow-api client.
 * SSE: see `./sse` (`streamStart` / `streamResume` / `streamContinue`).
 */

import { ApiError, ensureOk, requestBlob, requestJson } from "./http";
import type {
  CancelResponse,
  DocumentFormat,
  DocumentStatusResponse,
  DocumentUploadResponse,
  HealthResponse,
  InstructionResponse,
  ProviderSettingsResponse,
  ProviderSettingsUpdate,
  ProviderSettingsUpdateResponse,
  SectionCatalogResponse,
  SessionResponse,
  SessionStateResponse,
  SessionStatusResponse,
} from "../types/api";

export function createSession(): Promise<SessionResponse> {
  return requestJson<SessionResponse>("/sessions", { method: "POST" });
}

export function listSections(): Promise<SectionCatalogResponse> {
  return requestJson<SectionCatalogResponse>("/sections");
}

export function uploadDocument(threadId: string, file: File): Promise<DocumentUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("thread_id", threadId);
  return requestJson<DocumentUploadResponse>("/documents", {
    method: "POST",
    body: form,
    skipJsonContentType: true,
  });
}

export function getDocumentStatus(documentRef: string): Promise<DocumentStatusResponse> {
  return requestJson<DocumentStatusResponse>(
    `/documents/${encodeURIComponent(documentRef)}/status`
  );
}

export function getSessionState(threadId: string): Promise<SessionStateResponse> {
  return requestJson<SessionStateResponse>(
    `/sessions/${encodeURIComponent(threadId)}/state`
  ).then((raw) => ({
    values: raw.values ?? {},
    next: raw.next ?? [],
    interrupt: raw.interrupt ?? null,
    // Live BE may omit section_state until remediation lands.
    section_state: raw.section_state ?? null,
  }));
}

export function getSessionStatus(threadId: string): Promise<SessionStatusResponse> {
  return requestJson<SessionStatusResponse>(
    `/sessions/${encodeURIComponent(threadId)}/status`
  );
}

export function sendInstruction(
  threadId: string,
  text: string
): Promise<InstructionResponse> {
  return requestJson<InstructionResponse>(
    `/sessions/${encodeURIComponent(threadId)}/instruction`,
    {
      method: "POST",
      body: JSON.stringify({ text }),
    }
  );
}

export function cancelRun(threadId: string): Promise<CancelResponse> {
  return requestJson<{
    cancelled: boolean;
    was_running?: boolean;
    run_status?: string;
  }>(`/sessions/${encodeURIComponent(threadId)}/cancel`, {
    method: "POST",
  }).then((raw) => ({
    cancelled: raw.cancelled,
    // Live BE (pre-remediation) omits was_running; treat cancelled≈was_running.
    was_running: raw.was_running ?? raw.cancelled,
    run_status: "cancelled",
  }));
}

export function downloadDocument(
  threadId: string,
  format?: DocumentFormat
): Promise<Blob> {
  const qs = format ? `?format=${encodeURIComponent(format)}` : "";
  return requestBlob(`/sessions/${encodeURIComponent(threadId)}/document${qs}`);
}

export function getProviderSettings(): Promise<ProviderSettingsResponse> {
  return requestJson<ProviderSettingsResponse>("/settings/providers");
}

export function setProviderSettings(
  body: ProviderSettingsUpdate
): Promise<ProviderSettingsUpdateResponse> {
  return requestJson<ProviderSettingsUpdateResponse>("/settings/providers", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function checkHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/health");
}

/**
 * Probe `/health` with optional one-shot URL/token (Settings "Test connection").
 * Does not mutate the settings store.
 */
export async function probeHealth(opts?: {
  apiBaseUrl?: string;
  apiToken?: string;
}): Promise<HealthResponse> {
  const base = (opts?.apiBaseUrl ?? "").trim().replace(/\/$/, "");
  const url = `${base}/health`;
  const headers = new Headers();
  const token = (opts?.apiToken ?? "").trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(url || "/health", { headers });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach the API";
    throw new ApiError(0, message, err);
  }
  await ensureOk(res);
  return (await res.json()) as HealthResponse;
}
