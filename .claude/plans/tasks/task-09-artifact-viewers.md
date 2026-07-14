# Task 09 — Artifact viewers

> **Context recap:** During and after generation, users need to read streamed prose,
> structured section output, evidence/claims, and cross-section findings. Token events
> stream live text; state lives in `GET /sessions/{id}/state`.
>
> **Rewritten after the BE contract audit:** the old field names (`report_sections`,
> `final_report`) do not exist; token events are now attributed JSON; the in-progress
> section is exposed via `section_state`.

**Docs to read:** `plans/UI_FLOW.md` (center panel), BE `app/graph/state.py`
(`ReportState`), `app/api/routers/sessions.py` (`get_session_state`).

## Goal

**Artifact panel** with tabs: **Live** (token stream) | **Sections** | **Evidence** |
**Findings** | **Report**. The evidence/claims and findings views are what make the
pipeline credible for FDD work — they were missing from the old plan entirely.

## Dependencies: task 08 (shared content rendering).

## Scope

**In:** `src/components/artifacts/ArtifactPanel.tsx`; `src/components/artifacts/MarkdownView.tsx`;
`src/components/artifacts/LiveDraft.tsx`; `src/components/artifacts/EvidencePanel.tsx`;
`src/components/artifacts/FindingsPanel.tsx`; `src/hooks/useArtifactState.ts`.

**Out:** Export buttons (task 15); legacy sheet grid.

## Data sources (real field names)

| Source | Content |
|---|---|
| SSE `token` | JSON `{ text, node, namespace }` — BE emits only prose steps (`draft`/`persona_review`/`polish` execute); append `text` to the live buffer, keyed by `node` |
| `interrupt.content` | Snapshot at pause (task 08) |
| `GET /state → values.completed_sections` | `{ id, title, order, draft, claims, quality_verdict }[]` — finished sections |
| `GET /state → values.prior_findings` | `{ id, section_id, claim, evidence_refs }[]` — cross-section memory |
| `GET /state → values.metadata.cross_section_review` | `{ contradictions, duplicate_findings, cross_references }` |
| `GET /state → section_state` | the **in-progress** section: `{ section_id, draft, structured_outline, evidence_bundle, step_trace, clarifications, claims, quality_verdict, regen_count }` (null between sections) |
| `GET /state → values.error` | `{ message }` dict when failed |

`values.final_document` and `values.metadata.artifacts` are **server filesystem paths** —
never render or fetch them as content; export goes through `GET /document` (task 15).
Streamed tokens are not persisted anywhere — after a reconnect, rebuild the Live tab from
`section_state.draft` instead.

## UI

- Tab bar: **Live** | **Sections** | **Evidence** | **Findings** | **Report**
- Live: prose styling; auto-scroll toggle; label which step is streaming (from `token.node`).
- Sections: accordion per section from `completed_sections` (+ the in-progress one from
  `section_state`, marked live); markdown body; `quality_verdict` badge; persona-review
  output surfaced, not reduced to a rail label.
- Evidence: `section_state.evidence_bundle` + per-section `claims` with `evidence_refs`.
- Findings: `prior_findings` list + `metadata.cross_section_review` (contradictions /
  duplicates / cross-references) once present.
- Report: rendered markdown **via `GET /sessions/{id}/document?format=md`** after
  `run_status: "completed"` — not from state.
- Empty states per tab.

## Implementation notes

- Debounce token appends (requestAnimationFrame) for performance.
- Sanitize markdown if using HTML render.
- Reuse `MarkdownView` in InterruptCard (task 08) — extract shared component here.

## Verification

- Token stream: 100 rapid tokens → no UI freeze.
- Mock `state` JSON (use a real captured payload) → sections/evidence/findings populate.

## Integration check

Mid-run, `GET /state → section_state.draft` shows the current section's prose; after
`done`, `completed_sections` is non-empty.

## Definition of done

Artifact panel with five tabs; Handoff notes on the actual payloads observed.

---

## Status: todo

## Handoff notes

_(fill at completion)_
