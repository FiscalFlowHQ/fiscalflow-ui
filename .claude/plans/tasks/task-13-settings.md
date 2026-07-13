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

## Status: todo

## Handoff notes

_(fill at completion)_
