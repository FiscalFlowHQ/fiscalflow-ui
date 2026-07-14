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

- `npm run tauri:dev` opens window; upload via native picker works.
- `tauri:build` produces `.app` / `.dmg`.

## Definition of done

Tauri dev + build documented; file picker integrated; Handoff notes.

---

## Status: done

## Handoff notes

Completed 2026-07-14.

### What shipped
- **`src-tauri/`** — Tauri 2 scaffold (`identifier` `com.fiscalflow.ui`), icons from CLI init,
  `window` min **1200×800** (default 1280×860), CSP `connect-src` → `localhost:8000` /
  `127.0.0.1:8000`.
- Plugins: **dialog** + **fs** (Rust `lib.rs` + JS packages); capabilities grant
  `dialog:default`, `fs:allow-read-file`, and scoped `$HOME` / Documents / Downloads / Desktop.
- **`src/lib/tauri.ts`** — `isTauri()` (from `@tauri-apps/api/core`), `pickDatabookFile()`
  (native open → `readFile` → `File` for upload).
- **`DatabookPanel`** — Choose file uses native picker under Tauri; HTML `<input type="file">`
  retained for browser; drag-and-drop unchanged.
- **`env.ts`** — empty base URL under Tauri defaults to `http://localhost:8000`;
  release `beforeBuildCommand` also injects `VITE_API_BASE_URL=http://localhost:8000`.
- npm: `tauri`, `tauri:dev`, `tauri:build`; Vite ignores `src-tauri/**`.
- README rewritten with Rust / Xcode prerequisites, CORS env example, manual API start.
- Tests: `tauri.test.ts`; **106** green; `npm run build` green.

### Sidecar (stretch) — skipped
Auto-spawning `uvicorn` / packing a Python sidecar is **out of MVP**. Always start
fiscalflow-api separately on **:8000** before `npm run tauri:dev` / packaged app use.
Documented in README + this note.

### Verify on a machine with Rust
This agent environment had **no `rustc`/`cargo`**, so `tauri:dev` / `tauri:build` were
not executed here. On a prepared Mac:

```bash
# Terminal 1
cd fiscalflow-api && uvicorn app.main:app --port 8000
# Terminal 2
cd fiscalflow-ui && npm run tauri:dev
# Release
npm run tauri:build   # → src-tauri/target/release/bundle/
```

First Rust build will download crates and write `src-tauri/Cargo.lock` — **commit the lockfile**
after the first successful build.

### CORS (API)
Dev webview origin is `http://localhost:5173`. Production asset origin is typically
`tauri://localhost` / `http(s)://tauri.localhost`. Extend `FISCALFLOW_CORS_ORIGINS` on the
API (BE default is often **only** `http://localhost:1420`).

### For task 15
- Acceptance checklist: desktop open + native upload + `tauri:build` clean.
- Optional: regenerate icons with `npm run tauri icon path/to/brand.png`.
