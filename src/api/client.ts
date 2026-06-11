import type {
  AuditCreateResponse,
  ErrorEntry,
  ErrorsResponse,
  Progress,
  SheetData,
} from "../types";

const base = (auditId: string) => `/api/audits/${auditId}`;

export async function uploadAudit(file: File): Promise<AuditCreateResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/audits", { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Upload failed (${res.status})`);
  }
  return res.json();
}

export async function fetchSheets(auditId: string): Promise<string[]> {
  const res = await fetch(`${base(auditId)}/sheets`);
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
  const res = await fetch(`${base(auditId)}/errors?${params}`);
  return res.json();
}

export async function fetchError(auditId: string, errorId: string): Promise<ErrorEntry> {
  const res = await fetch(`${base(auditId)}/errors/${errorId}`);
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
  const res = await fetch(`${base(auditId)}/sheet_data?${params}`);
  return res.json();
}

export async function fetchProgress(auditId: string): Promise<Progress> {
  const res = await fetch(`${base(auditId)}/progress`);
  return res.json();
}

export async function applyFix(
  auditId: string,
  body: { error_id: string; formula: string; sheet_name: string; cell_address: string }
): Promise<{ success: boolean; error?: string; message?: string }> {
  const res = await fetch(`${base(auditId)}/apply_fix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function skipError(auditId: string, errorId: string): Promise<void> {
  await fetch(`${base(auditId)}/skip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error_id: errorId }),
  });
}

export async function undoFix(auditId: string): Promise<{ success: boolean; undone?: { error_id: string } }> {
  const res = await fetch(`${base(auditId)}/undo`, { method: "POST" });
  return res.json();
}

export function downloadUrl(auditId: string): string {
  return `${base(auditId)}/download`;
}

export async function saveReport(auditId: string): Promise<{ success: boolean; path?: string }> {
  const res = await fetch(`${base(auditId)}/save_report`, { method: "POST" });
  return res.json();
}
