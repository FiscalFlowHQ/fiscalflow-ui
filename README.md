# FiscalFlow UI

React frontend for the FiscalFlow Excel audit platform. Upload a workbook, run the audit via the API, and review/fix spreadsheet errors in an interactive UI ported from [csv-fixer](https://github.com/FiscalFlowHQ/csv-fixer) `review_ui.html`.

**Companion backend:** [fiscalflow-api](https://github.com/FiscalFlowHQ/fiscalflow-api)

## What it does

1. **Upload page** (`/`) — drag-and-drop or pick an `.xlsx` file; sends it to the API for auditing
2. **Review page** (`/review/:auditId`) — error sidebar, sheet viewer, formula fix editor, dependency chain, undo/download

## Stack

| Layer | Technology |
|-------|------------|
| UI | React 19 + TypeScript |
| Build | Vite 6 |
| Routing | react-router-dom |
| Styling | Ported CSS from csv-fixer (dark theme) |
| API | `fetch` → fiscalflow-api (dev proxy on `/api`) |

Desktop packaging via **Tauri** is planned; this repo is structured as a standard Vite SPA so `src-tauri/` can be added later without rewriting the UI.

## Requirements

- Node.js 18+ and npm
- [fiscalflow-api](https://github.com/FiscalFlowHQ/fiscalflow-api) running on port **8000**

## Setup

```bash
git clone https://github.com/FiscalFlowHQ/fiscalflow-ui.git
cd fiscalflow-ui

npm install
```

## Run (development)

**Terminal 1 — API:**

```bash
cd ../fiscalflow-api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — UI:**

```bash
npm run dev
```

Open http://localhost:5173

In dev, Vite proxies `/api/*` to `http://localhost:8000` (see `vite.config.ts`).

## Build

```bash
npm run build    # output in dist/
npm run preview  # serve production build locally
```

## Project structure

```
fiscalflow-ui/
├── src/
│   ├── pages/
│   │   ├── UploadPage.tsx     # xlsx upload → POST /api/audits
│   │   └── ReviewPage.tsx     # full review workflow
│   ├── components/
│   │   ├── TopBar.tsx
│   │   ├── SheetViewer.tsx
│   │   ├── SheetTabsBar.tsx
│   │   ├── Sidebar/           # error list, filters, grouping
│   │   └── DetailPanel/       # details, fix editor, dep chain
│   ├── api/client.ts          # typed API wrappers
│   ├── types.ts
│   ├── utils/badges.ts
│   └── styles/global.css
├── index.html
├── vite.config.ts
└── package.json
```

## Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | UploadPage | Select `.xlsx`, run audit, redirect on success |
| `/review/:auditId` | ReviewPage | Error review and fix UI |

## API integration

All requests go through `src/api/client.ts`:

- `uploadAudit(file)` → `POST /api/audits`
- `fetchErrors`, `fetchError`, `fetchSheetData`, `fetchProgress`
- `applyFix`, `skipError`, `undoFix`, `saveReport`, `downloadUrl`

The `auditId` from the upload response is used in the URL and all subsequent API calls.

## Review UI features

- Filter errors: All / Needs Fix / Suggested / Done
- Group errors by root cause (expandable)
- Infinite scroll (50 errors per page)
- Sheet tabs with search and error indicators
- Cell grid with target highlighting
- Formula editor with suggested fixes
- Undo, download fixed workbook, save report

## Future: Tauri desktop

This repo is the intended home for the desktop app:

- Add `src-tauri/` when ready
- Introduce `VITE_API_BASE_URL` for non-proxy API access
- Optional native file dialogs and sidecar for fiscalflow-api

No Tauri/Electron code is included yet.

## Status

**v0.1 — development / internal use.** Pairs with fiscalflow-api for local Excel audit workflows.

## License

Proprietary — FiscalFlowHQ
