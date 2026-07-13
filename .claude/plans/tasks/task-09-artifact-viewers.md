# Task 09 — Artifact viewers

> **Context recap:** During and after generation, users need to read streamed prose,
structured section output, and optionally audit artifacts. Token events stream live text;
final state lives in `GET /sessions/{id}/state`.

**Docs to read:** `plans/UI_FLOW.md` (center panel), BE `SessionStateResponse`.

## Goal

**Artifact panel** with tabs: Live draft (token stream), Section output (from state),
and optional Markdown report preview.

## Dependencies: task 08 (shared content rendering).

## Scope

**In:** `src/components/artifacts/ArtifactPanel.tsx`; `src/components/artifacts/MarkdownView.tsx`;
`src/components/artifacts/LiveDraft.tsx`; `src/hooks/useArtifactState.ts`.

**Out:** DOCX export (task 15); legacy sheet grid (keep in ReviewPage).

## Data sources

| Source | Content |
|---|---|
| SSE `token` | Append to live buffer for active step |
| `interrupt.content` | Snapshot at pause (task 08) |
| `GET /state` → `values` | Full report state after reconnect/done |

Parse `values` defensively — shape evolves with BE tasks 11–14. MVP fields to try:

- `report_sections` / section drafts
- `final_report` markdown
- `error` if failed

## UI

- Tab bar: **Live** | **Sections** | **Report**
- Live: monospace or prose styling; auto-scroll toggle.
- Sections: accordion per `section_id` with markdown body.
- Report: rendered markdown when `finalize` complete.
- Empty states per tab.

## Implementation notes

- Debounce token appends (requestAnimationFrame) for performance.
- Sanitize markdown if using HTML render.
- Reuse `MarkdownView` in InterruptCard (task 08) — extract shared component here.

## Verification

- Token stream: 100 rapid tokens → no UI freeze.
- Mock `state` JSON → sections accordion populates.

## Integration check

After `done`, `GET /state` returns non-empty section content (depends on BE LLM config).

## Definition of done

Artifact panel with three tabs; Handoff notes on actual `values` shape observed.

---

## Status: todo

## Handoff notes

_(fill at completion)_
