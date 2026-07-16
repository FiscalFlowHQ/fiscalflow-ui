# Parked upload entry; review UI is live

`UploadPage` stays unused (`/upload` → home). The **Review** workspace is wired again:

- Route: `/review/:auditId` (`src/pages/ReviewPage.tsx`)
- API: `fiscalflow-api` `GET/POST /api/audits/*` (report beside uploaded workbook)
- Entry: Databook panel **Review errors** when `audit_status=failed` and `audit_id` is set

`src/legacy/ReviewPage.tsx` is superseded by `src/pages/ReviewPage.tsx`.
