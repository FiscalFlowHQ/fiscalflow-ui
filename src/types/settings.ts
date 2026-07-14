/** Client-persisted connection prefs (localStorage `fiscalflow.settings.v1`). */
export type AppSettings = {
  /** Override API origin; empty = Vite env / same-origin proxy. */
  apiBaseUrl: string;
  /** Bearer token override; empty = Vite env token. */
  apiToken: string;
  /** Databook status poll interval; null = default (1500ms). */
  documentPollIntervalMs: number | null;
};
