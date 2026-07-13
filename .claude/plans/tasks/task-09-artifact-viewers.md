# Task 09 — Artifact viewers

> **Context recap:** During and after generation, users read streamed prose and completed
> section output. Final artifacts are **file paths** on the server, not inline markdown.

**Docs to read:** `plans/BACKEND_CONTRACT.md` (`ReportState` fields), BE task-14 handoff,
`app/api/routers/sessions.py` (`download_document`).

## Goal

**Artifact panel** with tabs: Live draft (SSE tokens), Sections (from state), Report
(download / preview).

## Dependencies: task 08 (shared `MarkdownView` and structured viewers).

## Scope

**In:** `src/components/artifacts/ArtifactPanel.tsx`; `src/components/artifacts/MarkdownView.tsx`;
`src/components/artifacts/LiveDraft.tsx`; `src/components/artifacts/SectionsAccordion.tsx`;
`src/components/artifacts/QualityBadge.tsx`; `src/hooks/useArtifactState.ts`.

**Out:** Final export buttons (task 15); legacy sheet grid (`ReviewPage`).

## Data sources (correct field names)

| Source | Fields | UI |
|---|---|---|
| SSE `token` | plain text | Live tab buffer |
| `interrupt.content` | e.g. `{ draft }` | Snapshot at pause (optional mirror) |
| `GET /state` → `values` | see below | Sections + Report tabs |

### `values` fields to use (not `report_sections` / `final_report`)

```typescript
values.completed_sections[]   // { id, title, draft, claims, quality_verdict }
values.final_document         // server path string — use download API, not inline read
values.metadata?.artifacts    // { markdown?, pptx?, pdf? } paths
values.run_status             // "completed" enables download
values.error                  // show failure banner (stringify if object)
values.current_section_index  // highlight active section in accordion
```

## UI

- **Live** — token stream; auto-scroll toggle; clear on new run.
- **Sections** — accordion per `completed_sections[].id`; show `draft` as markdown,
  `claims` count, `quality_verdict` badge (pass/fail summary).
- **Report** — when `run_status === "completed"`: preview via `downloadDocument(id, "md")`
  fetched once into memory, or "Download" buttons (full export in task 15).
- Empty states per tab with reason (`run not started`, `no sections yet`, `not completed`).

## Per-section deck (optional MVP+)

When `metadata.artifacts` gains per-section pptx after `collect_section`, show
"Download section deck" link if path present (best-effort; BE may only expose combined paths).

## Implementation notes

- Debounce token appends (`requestAnimationFrame`).
- Sanitize markdown HTML if using `react-markdown`.
- Extract `MarkdownView` here first; import from hitl renderers (task 08).
- On reconnect: hydrate sections from `GET /state` even without active SSE.

## Verification

- Mock `completed_sections` with draft text → accordion renders.
- Mock `run_status: "completed"` → Report tab triggers download (MSW).
- 100 rapid tokens → no UI freeze.

## Integration check

After live QoE run, `completed_sections[0].draft` is non-empty (LLM key required).

## Definition of done

Artifact panel uses correct state fields; Handoff confirms live `values` shape.

---

## Status: todo

## Handoff notes

_(fill at completion)_
