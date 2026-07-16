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

## Status: done

## Handoff notes

Completed 2026-07-14.

### What shipped
- `src/components/artifacts/MarkdownView.tsx` — shared markdown (no raw HTML); reused by
  `InterruptCard` (task 08).
- `LiveDraft.tsx` — rAF-batched token buffer, step label (`token.node`), auto-scroll toggle.
- `EvidencePanel.tsx` — `section_state.evidence_bundle` + claims/`evidence_refs`.
- `FindingsPanel.tsx` — `prior_findings` + `metadata.cross_section_review`
  (contradictions / duplicates / cross-references).
- `SectionsView.tsx` — accordion over `completed_sections` + in-progress `section_state`
  (live badge, `quality_verdict`, persona `review_notes`).
- `ArtifactPanel.tsx` — tabs Live | Sections | Evidence | Findings | Report.
- `useArtifactState.ts` — SSE tokens + GET /state hydration + Report via
  `GET /document?format=md` after `completed`; reconnect Live reseeds from
  `section_state.draft` when no token stream yet.
- Types tightened: `CompletedSection`, `Finding`, `SectionState`, `CrossSectionReview`, etc.
- Fixture: `fixtures/sessionState.sample.ts` (assembly-shaped mock, not live capture).
- `RunPage` 3-column preview: rail | artifacts | databook/composer/HITL (task 10 owns
  orchestrator polish).
- Tests: 100-token batch, state hydrate, report fetch, panel tabs (81 total green); build green.

### Payload / BE drift notes
- **Live `GET /state`** (`sessions.py`) returns `{ values, next, interrupt }` only —
  **`section_state` is omitted**. UI tolerates null; Evidence/Sections “live” rows stay empty
  until remediation lands. Mid-run draft still works via SSE tokens + interrupt `content.draft`.
- `final_document` / `metadata.artifacts` are **filesystem paths** — never rendered; Report
  tab uses `downloadDocument(…, "md")` only.
- Sample fixture mirrors BE assembly/`Section` + `Finding` shapes (`claim` + `evidence_refs`;
  claims also accept `claim_text`).

### For task 10 / 11 / 15
- Task 10: orchestrator should fan-out `artifacts.applyEvent` / `reset` / `refreshState`
  (already wired on RunPage; fold into `useRunOrchestrator`).
- Task 11: on reconnect, call `refreshState()` then rely on Live reseed from
  `section_state.draft` (or tokens after continue).
- Task 15: export buttons elsewhere; do not fetch path-valued artifact fields as content.
