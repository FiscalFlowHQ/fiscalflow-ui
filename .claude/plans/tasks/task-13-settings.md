# Task 13 — Settings screen

> **Context recap:** API URL, bearer token, and LLM provider registry. Provider keys live
> on the **API server env** — UI only sees `key_present`.

**Docs to read:** BE task-15, `app/api/routers/settings.py`, `plans/BACKEND_CONTRACT.md`.

## Goal

**Settings page** at `/settings` for connection + provider defaults. Changes unblock
**Start** in task-06 preflight.

## Dependencies: task 02.

## Scope

**In:** `src/pages/SettingsPage.tsx`; `src/stores/settingsStore.ts`; provider form.

### 1. API connection

- `VITE_API_BASE_URL` override (empty = proxy).
- Bearer token → localStorage `fiscalflow.settings.v1`.
- Test connection → `checkHealth()`.
- CORS / connection hints on failure.

### 2. LLM providers

- `GET /settings/providers` on load.
- Provider dropdown from `available_providers`.
- Model text field (optional; default from `default_model`).
- `PUT /settings/providers` on save.
- Per-row badge: **Key configured** / **Key missing** (`key_present`).
- Help text: "API keys are set as environment variables on the fiscalflow-api server
  (e.g. `ZHIPU_API_KEY`). This app cannot set keys remotely."

### 3. Advanced (optional)

- Document poll interval override.
- Link to fiscalflow-api README for env vars.

## Implementation notes

- Settings apply immediately to `getAuthHeaders()`.
- After save, composer preflight (task 06) should pass if `key_present` for selected provider.
- Mask token field; clear button.

## Verification

- Save provider → subsequent `getProviderSettings` reflects change.
- `key_present: false` → visible warning on Settings and composer (task 06).

## Definition of done

Settings page live; Handoff lists env vars needed for Z.ai pilot.

---

## Status: done

## Handoff notes

Completed 2026-07-14.

### What shipped
- `src/stores/settingsStore.ts` + `types/settings.ts` — localStorage
  `fiscalflow.settings.v1` (`apiBaseUrl`, `apiToken`, `documentPollIntervalMs`).
- `src/config/env.ts` — `getEffectiveApiBaseUrl` / `getEffectiveApiToken`;
  `apiUrl` + `getAuthHeaders()` read the store first, then Vite env (immediate after Save).
- `src/pages/SettingsPage.tsx` — API connection (masked token, Clear, Test + CORS hints),
  LLM provider form (`GET`/`PUT /settings/providers`, key badges), Advanced poll ms +
  README link.
- `probeHealth()` — one-shot `/health` using form URL/token without mutating the store.
- `RunComposer` — warning + link to Settings when the effective provider has
  `key_present: false` (or no keys at all).
- `DatabookPanel` — honors saved poll interval when prop omitted.
- Tests: `settingsStore.test.ts`, `SettingsPage.test.tsx`; **104** tests green; build green.

### Z.ai pilot — API server env vars
Set on **fiscalflow-api** (not in the UI):

| Var | Purpose |
|---|---|
| `ZAI_API_KEY` | Primary key for provider `zai` (`key_present`) |
| `ZHIPUAI_API_KEY` | Fallback / `glm` provider key map |
| `AUDITOR_LLM_PROVIDER=zai` | Optional process default when no Settings selection |
| `AUDITOR_LLM_MODEL=glm-4.7` | Optional model default |
| `ZAI_BASE_URL` | Z.ai OpenAI-compatible base (coding paas URL from BE pilot notes) |
| `FISCALFLOW_API_TOKEN` | Optional; match Settings / `VITE_API_TOKEN` bearer |
| `FISCALFLOW_CORS_ORIGINS` | Include `http://localhost:5173` if Settings uses a direct API URL |

UI Settings → save provider `zai` (+ model) after the key is present; empty API URL keeps the Vite proxy.

### For task 14 / 15
- Tauri should continue reading the same localStorage key (or migrate to secure storage).
- Export/polish can deep-link “fix keys” from composer warnings to Settings.
