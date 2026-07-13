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
(placeholder); update `vite.config.ts` proxy for direct BE paths (not only `/api/audits`);
`.env.example`; basic Vitest setup optional but recommended.

**Out:** API client (task 02), Tauri (task 14), removing legacy pages (task 15).

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
| `/review/:auditId` | `ReviewPage` | Legacy — keep working |

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
- TypeScript strict mode; path alias `@/` → `src/` optional.
- Do **not** add heavy UI libraries yet — use existing `global.css` dark theme.

## Verification

- `npm run dev` — all routes render without console errors.
- `npm run build` passes.
- `GET /health` via proxy shows green status on HomePage when API is up.
- Legacy `/` audit upload still reachable (move to `/audit` only if you document in Handoff).

## Integration check

Legacy `UploadPage`/`ReviewPage` still compile; new routes coexist.

## Definition of done

Route skeleton + env config + AppShell + health indicator; tracker + Handoff updated.

---

## Status: todo

## Handoff notes

_(fill at completion)_
