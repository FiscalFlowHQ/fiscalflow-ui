import { apiUrl, getAuthHeaders } from "../config/env";

/** Typed HTTP failure from fiscalflow-api (FastAPI `detail` payload). */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly body: unknown;

  constructor(status: number, detail: string, body?: unknown) {
    super(detail || `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.body = body;
  }
}

function formatDetail(body: unknown): string {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (typeof body === "object" && body !== null && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "msg" in item) {
            return String((item as { msg: unknown }).msg);
          }
          return JSON.stringify(item);
        })
        .join("; ");
    }
    if (detail != null) return JSON.stringify(detail);
  }
  return "";
}

async function readError(res: Response): Promise<ApiError> {
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep raw text */
  }
  const detail = formatDetail(body) || text || res.statusText || `HTTP ${res.status}`;
  return new ApiError(res.status, detail, body);
}

/** Throw {@link ApiError} when `res` is not OK (used by REST + SSE clients). */
export async function ensureOk(res: Response): Promise<void> {
  if (!res.ok) throw await readError(res);
}

export type RequestOptions = Omit<RequestInit, "headers"> & {
  headers?: HeadersInit;
  /** When true, do not set `Content-Type: application/json` (e.g. FormData). */
  skipJsonContentType?: boolean;
};

function buildHeaders(init?: RequestOptions, hasJsonBody = false): Headers {
  const headers = new Headers(init?.headers);
  const auth = getAuthHeaders();
  for (const [key, value] of Object.entries(auth)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  if (hasJsonBody && !headers.has("Content-Type") && !init?.skipJsonContentType) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

/**
 * Authenticated fetch against fiscalflow-api. Parses JSON on success;
 * throws {@link ApiError} on non-2xx (including 400/404/409/413/422/503).
 */
export async function requestJson<T>(path: string, init?: RequestOptions): Promise<T> {
  const hasJsonBody = typeof init?.body === "string";
  const headers = buildHeaders(init, hasJsonBody);
  const res = await fetch(apiUrl(path), { ...init, headers });
  await ensureOk(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/** Authenticated fetch that returns a binary body (document download). */
export async function requestBlob(path: string, init?: RequestOptions): Promise<Blob> {
  const headers = buildHeaders(init, false);
  const res = await fetch(apiUrl(path), { ...init, headers });
  await ensureOk(res);
  return res.blob();
}
