import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  getProviderSettings,
  probeHealth,
  setProviderSettings,
} from "../api/fiscalflow";
import { ApiError } from "../api/http";
import {
  clearApiToken,
  loadSettings,
  saveSettings,
} from "../stores/settingsStore";
import type { AvailableProvider, ProviderSettingsResponse } from "../types/api";

const API_README =
  "https://github.com/FiscalFlowHQ/fiscalflow-api/blob/main/README.md";

function connectionFailureHint(err: unknown): string {
  if (err instanceof ApiError && err.status === 0) {
    return (
      "Could not reach the API (network or CORS). Leave API URL empty for the Vite proxy " +
      "(browser) or Tauri’s localhost:8000 default. If you set a direct URL, extend " +
      "FISCALFLOW_CORS_ORIGINS on fiscalflow-api (include http://localhost:5173 and " +
      "tauri://localhost / http://tauri.localhost for desktop)."
    );
  }
  if (err instanceof TypeError) {
    return (
      "Browser blocked the request. Check that the API is running and CORS allows this origin, " +
      "or use the empty API URL + Vite proxy."
    );
  }
  if (err instanceof ApiError) {
    return err.detail || `HTTP ${err.status}`;
  }
  return err instanceof Error ? err.message : "Connection failed";
}

function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

export default function SettingsPage() {
  const stored = loadSettings();
  const [apiBaseUrl, setApiBaseUrl] = useState(stored.apiBaseUrl);
  const [apiToken, setApiToken] = useState(stored.apiToken);
  const [showToken, setShowToken] = useState(false);
  const [pollMs, setPollMs] = useState(
    stored.documentPollIntervalMs != null
      ? String(stored.documentPollIntervalMs)
      : ""
  );

  const [connectionMsg, setConnectionMsg] = useState<string | null>(null);
  const [connectionTone, setConnectionTone] = useState<"ok" | "error" | "info">(
    "info"
  );
  const [testing, setTesting] = useState(false);
  const [savingConnection, setSavingConnection] = useState(false);

  const [providerSnap, setProviderSnap] =
    useState<ProviderSettingsResponse | null>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [savingProviders, setSavingProviders] = useState(false);
  const [providersMsg, setProvidersMsg] = useState<string | null>(null);

  const refreshProviders = useCallback(async () => {
    setProvidersLoading(true);
    setProvidersError(null);
    try {
      const res = await getProviderSettings();
      setProviderSnap(res);
      setProvider(res.provider ?? "");
      setModel(res.model ?? "");
    } catch (err) {
      setProvidersError(
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : "Failed to load providers"
      );
    } finally {
      setProvidersLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProviders();
  }, [refreshProviders]);

  const available: AvailableProvider[] = providerSnap?.available_providers ?? [];

  const selectedMeta = useMemo(
    () => available.find((p) => p.provider === provider) ?? null,
    [available, provider]
  );

  async function onSaveConnection(e?: FormEvent) {
    e?.preventDefault();
    setSavingConnection(true);
    setConnectionMsg(null);
    try {
      const poll =
        pollMs.trim() === ""
          ? null
          : Number.parseInt(pollMs.trim(), 10);
      if (pollMs.trim() !== "" && (!Number.isFinite(poll) || (poll ?? 0) <= 0)) {
        setConnectionTone("error");
        setConnectionMsg("Document poll interval must be a positive number of ms.");
        return;
      }
      saveSettings({
        apiBaseUrl,
        apiToken,
        documentPollIntervalMs: poll,
      });
      setConnectionTone("ok");
      setConnectionMsg("Connection settings saved. Auth headers update immediately.");
    } finally {
      setSavingConnection(false);
    }
  }

  async function onTestConnection() {
    setTesting(true);
    setConnectionMsg(null);
    try {
      const res = await probeHealth({
        apiBaseUrl: apiBaseUrl.trim(),
        apiToken: apiToken.trim(),
      });
      setConnectionTone("ok");
      setConnectionMsg(
        `Connected — /health returned status “${res.status || "ok"}”.`
      );
    } catch (err) {
      setConnectionTone("error");
      setConnectionMsg(connectionFailureHint(err));
    } finally {
      setTesting(false);
    }
  }

  function onClearToken() {
    clearApiToken();
    setApiToken("");
    setConnectionTone("info");
    setConnectionMsg("Bearer token cleared from local storage.");
  }

  async function onSaveProviders(e: FormEvent) {
    e.preventDefault();
    if (!provider.trim()) {
      setProvidersMsg("Select a provider before saving.");
      return;
    }
    setSavingProviders(true);
    setProvidersMsg(null);
    try {
      const body = {
        provider: provider.trim(),
        model: model.trim() || undefined,
      };
      const res = await setProviderSettings(body);
      setProvidersMsg(
        `Saved default provider “${res.provider}”${res.model ? ` · ${res.model}` : ""}.`
      );
      await refreshProviders();
    } catch (err) {
      setProvidersMsg(
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : "Failed to save provider"
      );
    } finally {
      setSavingProviders(false);
    }
  }

  return (
    <div className="settings-page">
      <header className="settings-page__header">
        <p className="settings-page__eyebrow">
          <Link to="/">Home</Link>
        </p>
        <h1>Settings</h1>
        <p className="settings-page__lede">
          API connection for this desktop client, and default LLM provider for new runs.
          Provider API keys live on the <strong>fiscalflow-api</strong> server — this app
          only shows whether a key is present.
        </p>
      </header>

      <section className="settings-card" aria-labelledby="settings-connection">
        <h2 id="settings-connection">API connection</h2>
        <form className="settings-form" onSubmit={(e) => void onSaveConnection(e)}>
          <label className="settings-field">
            <span>API base URL</span>
            <input
              type="url"
              value={apiBaseUrl}
              placeholder="Leave empty for Vite proxy (recommended)"
              onChange={(e) => setApiBaseUrl(e.target.value)}
              autoComplete="off"
            />
            <span className="settings-field__hint">
              Empty uses same-origin (Vite proxies <code>/sessions</code>,{" "}
              <code>/settings</code>, …). Direct <code>http://localhost:8000</code> needs
              CORS on the API.
            </span>
          </label>

          <label className="settings-field">
            <span>Bearer token</span>
            <div className="settings-token-row">
              <input
                type={showToken ? "text" : "password"}
                value={apiToken}
                placeholder="Optional — match FISCALFLOW_API_TOKEN"
                onChange={(e) => setApiToken(e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowToken((v) => !v)}
              >
                {showToken ? "Hide" : "Show"}
              </button>
              <button type="button" className="btn-secondary" onClick={onClearToken}>
                Clear
              </button>
            </div>
            {apiToken ? (
              <span className="settings-field__hint">
                Masked preview: {maskToken(apiToken)}
              </span>
            ) : (
              <span className="settings-field__hint">
                No token in this form. Save clears any previously stored override.
              </span>
            )}
          </label>

          {connectionMsg && (
            <p
              className={`settings-banner settings-banner--${connectionTone}`}
              role="status"
            >
              {connectionMsg}
            </p>
          )}

          <div className="settings-actions">
            <button type="submit" className="btn-primary" disabled={savingConnection}>
              {savingConnection ? "Saving…" : "Save connection"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={testing}
              onClick={() => void onTestConnection()}
            >
              {testing ? "Testing…" : "Test connection"}
            </button>
          </div>
        </form>
      </section>

      <section className="settings-card" aria-labelledby="settings-providers">
        <h2 id="settings-providers">LLM providers</h2>
        <p className="settings-help">
          API keys are set as environment variables on the fiscalflow-api server (e.g.{" "}
          <code>ZAI_API_KEY</code>, <code>OPENAI_API_KEY</code>). This app cannot set keys
          remotely.
        </p>

        {providersLoading && <p className="settings-muted">Loading providers…</p>}
        {providersError && (
          <p className="settings-banner settings-banner--error" role="alert">
            {providersError}{" "}
            <button type="button" className="btn-secondary" onClick={() => void refreshProviders()}>
              Retry
            </button>
          </p>
        )}

        {!providersLoading && !providersError && (
          <form className="settings-form" onSubmit={(e) => void onSaveProviders(e)}>
            <label className="settings-field">
              <span>Default provider</span>
              <select
                value={provider}
                onChange={(e) => {
                  const next = e.target.value;
                  setProvider(next);
                  const meta = available.find((p) => p.provider === next);
                  if (meta?.default_model) setModel(meta.default_model);
                }}
              >
                <option value="">Select…</option>
                {available.map((p) => (
                  <option key={p.provider} value={p.provider}>
                    {p.provider}
                    {p.default_model ? ` · ${p.default_model}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="settings-field">
              <span>Model (optional)</span>
              <input
                type="text"
                value={model}
                placeholder={selectedMeta?.default_model || "provider default"}
                onChange={(e) => setModel(e.target.value)}
                autoComplete="off"
              />
            </label>

            <ul className="settings-provider-list" aria-label="Provider key status">
              {available.map((p) => (
                <li key={p.provider} className="settings-provider-row">
                  <span className="settings-provider-row__name">
                    {p.provider}
                    {p.default_model ? (
                      <span className="settings-muted"> · {p.default_model}</span>
                    ) : null}
                  </span>
                  <span
                    className={
                      p.key_present
                        ? "status-chip status-chip--complete"
                        : "status-chip status-chip--failed"
                    }
                  >
                    {p.key_present ? "Key configured" : "Key missing"}
                  </span>
                </li>
              ))}
            </ul>

            {selectedMeta && !selectedMeta.key_present && (
              <p className="settings-banner settings-banner--error" role="status">
                Selected provider “{selectedMeta.provider}” has no API key on the server.
                Set the matching env var and restart fiscalflow-api before starting a run.
              </p>
            )}

            {providersMsg && (
              <p className="settings-banner settings-banner--info" role="status">
                {providersMsg}
              </p>
            )}

            <div className="settings-actions">
              <button
                type="submit"
                className="btn-primary"
                disabled={savingProviders || !provider}
              >
                {savingProviders ? "Saving…" : "Save provider"}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="settings-card" aria-labelledby="settings-advanced">
        <h2 id="settings-advanced">Advanced</h2>
        <label className="settings-field">
          <span>Document status poll interval (ms)</span>
          <input
            type="number"
            min={200}
            step={100}
            value={pollMs}
            placeholder="1500"
            onChange={(e) => setPollMs(e.target.value)}
          />
          <span className="settings-field__hint">
            Optional override for databook ingestion polling. Empty uses the default
            1500&nbsp;ms. Click Save connection to persist.
          </span>
        </label>
        <p className="settings-muted">
          Server env reference:{" "}
          <a href={API_README} target="_blank" rel="noreferrer">
            fiscalflow-api README
          </a>
          .
        </p>
      </section>
    </div>
  );
}
