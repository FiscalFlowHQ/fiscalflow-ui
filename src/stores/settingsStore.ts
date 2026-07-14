import type { AppSettings } from "../types/settings";

export const SETTINGS_STORAGE_KEY = "fiscalflow.settings.v1";

export const DEFAULT_SETTINGS: AppSettings = {
  apiBaseUrl: "",
  apiToken: "",
  documentPollIntervalMs: null,
};

function canUseStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function isAppSettings(value: unknown): value is AppSettings {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.apiBaseUrl === "string" &&
    typeof s.apiToken === "string" &&
    (s.documentPollIntervalMs === null ||
      typeof s.documentPollIntervalMs === "number")
  );
}

function readRaw(): AppSettings {
  if (!canUseStorage()) return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as unknown;
    if (!isAppSettings(parsed)) return { ...DEFAULT_SETTINGS };
    return {
      apiBaseUrl: parsed.apiBaseUrl,
      apiToken: parsed.apiToken,
      documentPollIntervalMs:
        typeof parsed.documentPollIntervalMs === "number" &&
        Number.isFinite(parsed.documentPollIntervalMs) &&
        parsed.documentPollIntervalMs > 0
          ? Math.floor(parsed.documentPollIntervalMs)
          : null,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeRaw(settings: AppSettings): void {
  if (!canUseStorage()) return;
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

/** Load connection / advanced prefs from localStorage. */
export function loadSettings(): AppSettings {
  return readRaw();
}

/** Merge and persist; returns the stored snapshot. Applies immediately for `getAuthHeaders()`. */
export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const current = readRaw();
  const next: AppSettings = {
    apiBaseUrl:
      patch.apiBaseUrl !== undefined
        ? patch.apiBaseUrl.trim()
        : current.apiBaseUrl,
    apiToken: patch.apiToken !== undefined ? patch.apiToken : current.apiToken,
    documentPollIntervalMs:
      patch.documentPollIntervalMs !== undefined
        ? normalizePollMs(patch.documentPollIntervalMs)
        : current.documentPollIntervalMs,
  };
  writeRaw(next);
  return next;
}

function normalizePollMs(value: number | null): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

/** Clear bearer token only. */
export function clearApiToken(): AppSettings {
  return saveSettings({ apiToken: "" });
}

export function clearSettingsForTests(): void {
  if (!canUseStorage()) return;
  localStorage.removeItem(SETTINGS_STORAGE_KEY);
}
