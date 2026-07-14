# Parked: csv-fixer audit UI

These pages (`UploadPage`, `ReviewPage`) are **not routed**. They called `/api/audits/*`,
which does not exist in fiscalflow-api or this app’s FDD surface.

- `/upload` and `/review/*` redirect to Home (`/`).
- Sidebar audit components under `src/components/` remain for historical reference;
  task 15 does not treat “legacy review works” as an acceptance criterion.

Do not re-enable these routes without a real audits API.
