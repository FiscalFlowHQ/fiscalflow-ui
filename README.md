# FiscalFlow UI

React frontend for Excel audit and error review. Desktop shell (Tauri) to be added later.

## Setup

```bash
npm install
```

## Run (development)

Start the API first (see [fiscalflow-api](../fiscalflow-api)):

```bash
# Terminal 1
cd ../fiscalflow-api && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000

# Terminal 2
npm run dev
```

Open http://localhost:5173 — upload an `.xlsx` file to run the audit and open the review UI.

## Build

```bash
npm run build
```
