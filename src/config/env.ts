/** Runtime config from Vite env. Empty apiBaseUrl = same-origin (dev proxy). */

export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
  apiToken: import.meta.env.VITE_API_TOKEN ?? "",
};

/** Absolute URL for an API path (`/health`, `/sessions`, …). */
export function apiUrl(path: string): string {
  const base = config.apiBaseUrl.replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

/** Bearer headers when `VITE_API_TOKEN` is set; empty object otherwise. */
export function getAuthHeaders(): Record<string, string> {
  if (!config.apiToken) return {};
  return { Authorization: `Bearer ${config.apiToken}` };
}
