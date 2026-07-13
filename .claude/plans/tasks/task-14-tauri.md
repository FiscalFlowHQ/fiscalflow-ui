# Task 14 — Tauri desktop shell

> **Context recap:** README promises a Tauri desktop app. Package the Vite build as a
native shell with file picker, optional API sidecar, and production API URL defaults.

**Docs to read:** Tauri v2 docs, BE CORS `http://localhost:1420`, `plans/UI_FLOW.md`.

## Goal

**Tauri 2** project wrapping the React UI — dev and release builds on macOS (Windows optional).

## Dependencies: task 10 (functional web UI).

## Scope

**In:** `src-tauri/` scaffold; `tauri.conf.json`; npm scripts `tauri dev` / `tauri build`;
native file dialog for databook upload; window title/icon.

**Out:** Auto-start Python API sidecar (document manual start for MVP; sidecar optional stretch).

## Deliverables

```
src-tauri/
├── Cargo.toml
├── tauri.conf.json
├── src/main.rs
└── icons/
```

- Dev: Vite on `5173`, Tauri webview, API on `8000`.
- Production: `VITE_API_BASE_URL=http://localhost:8000` or bundled sidecar URL.
- Replace web `<input type="file">` in task 05 with `@tauri-apps/plugin-dialog` when `window.__TAURI__`.

## Implementation notes

- Add `@tauri-apps/api` + dialog plugin; guard with `isTauri()` helper for web fallback.
- CSP: allow connect to localhost API.
- Minimum window 1200×800.
- Update README with Tauri prerequisites (Rust, Xcode CLT on macOS).

## Optional stretch

- Spawn `uvicorn` as child process on app start (complex — note in Handoff if skipped).

## Verification

- `npm run tauri dev` opens window; upload via native picker works.
- `tauri build` produces `.app` / `.dmg`.

## Definition of done

Tauri dev + build documented; file picker integrated; Handoff notes.

---

## Status: todo

## Handoff notes

_(fill at completion)_
