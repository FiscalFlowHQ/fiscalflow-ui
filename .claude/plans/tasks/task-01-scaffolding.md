# Task 01 — Scaffolding & app shell

> **Context recap:** FiscalFlow UI is a Tauri-ready React SPA that drives
> `fiscalflow-api` over HTTP/SSE. Read `tasks/00-index.md` and
> `.claude/PROJECT_CONTEXT.md` first.

**Docs to read:** `plans/UI_FLOW.md` (routes), `fiscalflow-api` task-01 handoff (CORS origins).

## Goal

A bootable Vite app with the **new route skeleton**, env-based API config, shared layout
shell, and health-check — without breaking the legacy audit pages yet.

## Dependencies: none.

## Scope

**In:** folder structure under `src/`; `App.tsx` routes; `src/config/env.ts`;
`src/layouts/AppShell.tsx`; `src/pages/HomePage.tsx` (placeholder); `src/pages/RunPage.tsx`
(placeholder); update `vite.config.ts` proxy for direct BE paths; `.env.example`;
**Vitest + React Testing Library + msw + jsdom setup and a `test` script — MANDATORY,
not optional** (tasks 02, 03, and 07 have unit-test DoDs and none of this exists in the
repo today); install `react-markdown` (tasks 08/09 assume a `MarkdownView`).

**Out:** API client (task 02), Tauri (task 14 — note: greenfield, no `src-tauri/` exists),
legacy page removal (task 15).

## Target structure

```
src/
├── api/           # task 02
├── components/    # shared + legacy audit components (keep)
├── config/env.ts
├── hooks/
├── layouts/AppShell.tsx
├── pages/
│   ├── HomePage.tsx
│   ├── RunPage.tsx
│   ├── UploadPage.tsx      # legacy
│   └── ReviewPage.tsx      # legacy
├── stores/        # optional; task 04+
├── types/         # task 02
└── styles/
```

## Routes

| Path | Component | Notes |
|---|---|---|
| `/` | `HomePage` | Session list (stub) |
| `/run/:threadId` | `RunPage` | Workspace stub |
| `/settings` | `SettingsPage` stub or route to task 13 |
| `/review/:auditId` | `ReviewPage` | Legacy — parked, see below |

> **Legacy reality check:** the legacy pages call `/api/audits/*`
> (`src/api/client.ts`), an endpoint that exists in **neither** repo (the Flask app in
> `fiscalflow-api/apps/review_app.py` exposes different routes and is out of BE scope).
> The legacy flow is dead code — keep the pages compiling, but do not treat "audit flow
> works" as anything this task can preserve or verify.

## Interfaces exposed

```typescript
// src/config/env.ts
export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "",  // "" = same-origin / proxy
  apiToken: import.meta.env.VITE_API_TOKEN ?? "",
};
```

Vite dev proxy: forward `/sessions`, `/documents`, `/health`, `/settings` to `:8000`
(in addition to existing `/api` for legacy).

## Implementation notes

- `AppShell`: top bar (logo, settings link), outlet for children.
- `HomePage`: "FiscalFlow" + "New FDD run" button (no-op until task 04) + backend status dot
  (`GET /health`).
- Bearer token: centralize in a `getAuthHeaders()` helper used by task 02.
- TypeScript strict mode. **`noUnusedLocals`/`noUnusedParameters` are ON** — placeholder
  pages with stub props will fail `npm run build`; underscore-prefix or omit unused params.
- Do **not** add heavy UI libraries yet. `global.css` is NOT a reusable design system —
  it is a fixed 4-row/2-col grid hard-wired to the audit screen with
  `body { overflow: hidden }`; only the `:root` token block carries over. Budget a small
  base-layout pass here.
- CORS: the BE default origin is `http://localhost:1420` **only** (Tauri). The Vite dev
  proxy keeps 5173 same-origin, but any `VITE_API_BASE_URL` direct-connect from 5173
  needs `FISCALFLOW_CORS_ORIGINS` extended on the BE.

## Verification

- `npm run dev` — all routes render without console errors.
- `npm run build` and `npm test` pass.
- `GET /health` via proxy shows green status on HomePage when API is up.

## Integration check

Legacy `UploadPage`/`ReviewPage` still compile; new routes coexist.

## Definition of done

Route skeleton + env config + AppShell + health indicator; tracker + Handoff updated.

---

## Status: done

## Handoff notes

Completed 2026-07-14.

### What shipped
- Route skeleton under `AppShell`: `/` → `HomePage`, `/run/:threadId` → `RunPage` stub,
  `/settings` → `SettingsPage` stub. Legacy audit kept at `/upload` + `/review/:auditId`
  (still compiles; dead `/api/audits` client untouched).
- `src/config/env.ts`: `config`, `apiUrl()`, `getAuthHeaders()` for task 02.
- Vite proxy: `/sessions`, `/documents`, `/health`, `/settings`, `/sections` (+ `/api`) → `:8000`.
- `.env.example` documents `VITE_API_BASE_URL` / `VITE_API_TOKEN`.
- Base shell CSS: `:root` tokens kept; `body { overflow: hidden }` removed; overflow locked only on legacy `.app` grid.
- Deps: `react-markdown`; Vitest + RTL + jest-dom + user-event + jsdom + msw.
- Scripts: `npm test` (`vitest run`), `npm run test:watch`.
- Smoke tests in `src/test/App.test.tsx` (routes + health ok/offline + config defaults) —
  all 6 green; `npm run build` green.

### Interfaces for next tasks
- `getAuthHeaders()` / `apiUrl()` — REST client (task 02) should use these exclusively.
- Empty `src/hooks/`, `src/stores/` reserved; types stay in `src/types.ts` until task 02 splits `src/types/`.
- Home “New FDD run” is intentionally disabled until task 04 creates sessions.

### CORS / env
- Default `VITE_API_BASE_URL=""` → same-origin proxy (no CORS). Direct connect from `:5173`
  still needs BE `FISCALFLOW_CORS_ORIGINS` to include `http://localhost:5173` (BE default is
  only `http://localhost:1420`).

### Manual check
- With API up: HomePage health dot goes green via `GET /health` through the proxy.
- Without API: red “Backend offline” (covered by MSW error test).
