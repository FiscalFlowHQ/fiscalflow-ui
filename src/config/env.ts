import { loadSettings } from "../stores/settingsStore";
import { isTauri } from "../lib/tauri";

/** Build-time defaults from Vite env. Empty apiBaseUrl = same-origin (dev proxy). */
export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
  apiToken: import.meta.env.VITE_API_TOKEN ?? "",
};

/**
 * Effective API origin:
 * 1) Settings localStorage override
 * 2) Vite `VITE_API_BASE_URL` (Tauri release builds set this to http://localhost:8000)
 * 3) Tauri webview with empty env → localhost:8000 (no Vite proxy in the shell)
 * 4) Browser → empty (same-origin / Vite proxy)
 */
export function getEffectiveApiBaseUrl(): string {
  const override = loadSettings().apiBaseUrl.trim();
  if (override) return override;
  const vite = (config.apiBaseUrl ?? "").trim();
  if (vite) return vite;
  if (isTauri()) return "http://localhost:8000";
  return "";
}

/** Effective bearer token: localStorage override → Vite env. */
export function getEffectiveApiToken(): string {
  const override = loadSettings().apiToken;
  if (override) return override;
  return config.apiToken ?? "";
}

/** Absolute URL for an API path (`/health`, `/sessions`, …). */
export function apiUrl(path: string): string {
  const base = getEffectiveApiBaseUrl().replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

/** Bearer headers when a token is configured (settings or Vite); empty object otherwise. */
export function getAuthHeaders(): Record<string, string> {
  const token = getEffectiveApiToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
