import { apiUrl, getAuthHeaders } from "../config/env";
import type {
  AuditCreateResponse,
  ErrorEntry,
  ErrorsResponse,
  Progress,
  SheetData,
} from "../types";

const base = (auditId: string) => `/api/audits/${encodeURIComponent(auditId)}`;

async function auditFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(getAuthHeaders())) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return fetch(apiUrl(path), { ...init, headers });
}

export async function uploadAudit(file: File): Promise<AuditCreateResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await auditFetch("/api/audits", { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (typeof err === "object" && err && "detail" in err && String((err as { detail: unknown }).detail)) ||
        `Upload failed (${res.status})`
    );
  }
  return res.json();
}

export async function fetchSheets(auditId: string): Promise<string[]> {
  const res = await auditFetch(`${base(auditId)}/sheets`);
  if (!res.ok) {
    throw new Error(`Failed to load sheets (${res.status})`);
  }
  const data = await res.json();
  return data.sheets || [];
}

export async function fetchErrors(
  auditId: string,
  opts: { page?: number; perPage?: number; status?: string; sheet?: string | null }
): Promise<ErrorsResponse> {
  const params = new URLSearchParams();
  params.set("page", String(opts.page ?? 1));
  params.set("per_page", String(opts.perPage ?? 50));
  if (opts.status && opts.status !== "all") params.set("status", opts.status);
  if (opts.sheet) params.set("sheet", opts.sheet);
  const res = await auditFetch(`${base(auditId)}/errors?${params}`);
  if (!res.ok) {
    throw new Error(`Failed to load errors (${res.status})`);
  }
  return res.json();
}

export async function fetchError(auditId: string, errorId: string): Promise<ErrorEntry> {
  const res = await auditFetch(`${base(auditId)}/errors/${encodeURIComponent(errorId)}`);
  if (!res.ok) throw new Error("Error not found");
  return res.json();
}

export async function fetchSheetData(
  auditId: string,
  sheet: string,
  cell: string,
  radius = 8
): Promise<SheetData> {
  const params = new URLSearchParams({ sheet, cell, radius: String(radius) });
  const res = await auditFetch(`${base(auditId)}/sheet_data?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail =
      typeof err === "object" && err && "detail" in err
        ? String((err as { detail: unknown }).detail)
        : `Failed to load sheet (${res.status})`;
    return { error: detail } as SheetData;
  }
  return res.json();
}

export async function fetchProgress(auditId: string): Promise<Progress> {
  const res = await auditFetch(`${base(auditId)}/progress`);
  return res.json();
}

export async function applyFix(
  auditId: string,
  body: { error_id: string; formula: string; sheet_name: string; cell_address: string }
): Promise<{ success: boolean; error?: string; message?: string }> {
  const res = await auditFetch(`${base(auditId)}/apply_fix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function skipError(auditId: string, errorId: string): Promise<void> {
  await auditFetch(`${base(auditId)}/skip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error_id: errorId }),
  });
}

export async function undoFix(
  auditId: string
): Promise<{ success: boolean; undone?: { error_id: string } }> {
  const res = await auditFetch(`${base(auditId)}/undo`, { method: "POST" });
  return res.json();
}

export function downloadUrl(auditId: string): string {
  return apiUrl(`${base(auditId)}/download`);
}

export async function saveReport(auditId: string): Promise<{ success: boolean; path?: string }> {
  const res = await auditFetch(`${base(auditId)}/save_report`, { method: "POST" });
  return res.json();
}

export async function reingestAudit(
  auditId: string
): Promise<{ passed: boolean; summary: string; status: string; audit_id: string }> {
  const res = await auditFetch(`${base(auditId)}/reingest`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (typeof err === "object" && err && "detail" in err && String((err as { detail: unknown }).detail)) ||
        `Re-ingest failed (${res.status})`
    );
  }
  return res.json();
}
