# Task 13 — Settings screen

> **Context recap:** Local configuration: API base URL, bearer token, and LLM provider
registry via **live** BE endpoints. Settings must work in browser dev and Tauri production.

**Docs to read:** BE task-15 handoff, `app/api/routers/settings.py`, `plans/UI_FLOW.md`.

## Goal

**Settings page** at `/settings` for connection config and provider management.

## Dependencies: task 02.

## Scope

**In:** `src/pages/SettingsPage.tsx`; `src/stores/settingsStore.ts` (localStorage);
`src/api/fiscalflow.ts` extensions for providers when available.

**Out:** BE-side provider validation logic.

## Sections

### 1. API connection (implement now)

- `VITE_API_BASE_URL` override field (default empty = proxy).
- API bearer token (password input) — stored in localStorage `fiscalflow.settings.v1`.
- **Test connection** button → `checkHealth()`.
- CORS hint if health fails from browser.

### 2. LLM providers (BE-15 — implement now)

- `GET /settings/providers` → `{ provider, model, available_providers: [{ provider, default_model, key_present }] }`.
- `PUT /settings/providers` → `{ provider, model? }` — keys stay in server env (`key_present` only).
- Default provider/model saved on BE MetaStore; run composer can still pass `provider_override` per run.

### 3. Advanced (optional)

- Poll interval for document status.
- Theme toggle (defer if global.css only dark).

## Implementation notes

- Settings apply immediately to `getAuthHeaders()` without restart.
- Mask secrets in UI; clear key button.
- If providers endpoint fails, show connection error (should not 404 — BE-15 is done).

## Verification

- Save token → subsequent API calls include `Authorization`.
- Health test shows success/failure inline.

## Integration check

BE health endpoint returns 200 without auth (confirm in BE task-01).

## Definition of done

Settings page with connection section; provider section stubbed or live per BE-15; Handoff.

---

## Status: todo

## Handoff notes

_(fill at completion)_
