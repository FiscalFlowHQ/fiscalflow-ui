import { useEffect, useMemo, useState } from "react";
import { getProviderSettings } from "../../api/fiscalflow";
import { useSectionCatalog } from "../../hooks/useSectionCatalog";
import type { ApprovalPolicyName, StartGenerationRequest } from "../../types/api";

export type RunComposerProps = {
  databookReady: boolean;
  documentRef: string | null;
  locked: boolean;
  starting: boolean;
  startError: string | null;
  onStart: (body: StartGenerationRequest) => void;
  onClearStartError?: () => void;
};

export default function RunComposer({
  databookReady,
  documentRef,
  locked,
  starting,
  startError,
  onStart,
  onClearStartError,
}: RunComposerProps) {
  const { sections, loading, error: catalogError, refresh } = useSectionCatalog();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [instruction, setInstruction] = useState("");
  const [policy, setPolicy] = useState<ApprovalPolicyName>("balanced");
  const [providerOverride, setProviderOverride] = useState<string>("");
  const [providers, setProviders] = useState<
    { provider: string; default_model: string; key_present: boolean }[]
  >([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getProviderSettings()
      .then((res) => {
        if (!cancelled) setProviders(res.available_providers ?? []);
      })
      .catch(() => {
        /* optional — settings may be unset; Start still works without override */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Default-select all catalog sections when they first load.
  useEffect(() => {
    if (sections.length === 0) return;
    setSelected((prev) => {
      if (prev.size > 0) return prev;
      return new Set(sections.map((s) => s.id));
    });
  }, [sections]);

  const canStart =
    databookReady &&
    Boolean(documentRef) &&
    !locked &&
    !starting &&
    !loading &&
    sections.length > 0;

  const structureHint = useMemo(() => {
    const first = sections.find((s) => selected.has(s.id));
    if (!first?.required_structure?.length) return null;
    return first.required_structure.join(", ");
  }, [sections, selected]);

  function toggleSection(id: string) {
    if (locked) return;
    onClearStartError?.();
    setValidationError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleStart() {
    onClearStartError?.();
    if (!databookReady || !documentRef) {
      setValidationError("Wait until the databook is Ready before starting.");
      return;
    }
    if (selected.size === 0) {
      setValidationError("Select at least one section.");
      return;
    }

    const body: StartGenerationRequest = {
      selected_sections: [...selected],
      document_ref: documentRef,
      approval_policy: policy,
      instruction: instruction.trim() || null,
      provider_override: providerOverride || null,
    };
    onStart(body);
  }

  return (
    <section className={`run-composer${locked ? " run-composer--locked" : ""}`} aria-label="Run composer">
      <header className="run-composer__head">
        <h2 className="run-composer__title">Composer</h2>
        {locked && (
          <span className="status-chip status-chip--running">
            {starting ? "Running…" : "Locked"}
          </span>
        )}
      </header>

      {!databookReady && (
        <p className="run-composer__hint">Upload a databook and wait until Ready to start.</p>
      )}

      <fieldset className="run-composer__fieldset" disabled={locked || loading}>
        <legend>Sections</legend>
        {loading && <p className="run-composer__hint">Loading catalog…</p>}
        {catalogError && (
          <div className="run-composer__error" role="alert">
            <p>{catalogError}</p>
            <button type="button" className="btn-secondary" onClick={() => void refresh()}>
              Retry catalog
            </button>
          </div>
        )}
        {!loading && !catalogError && sections.length === 0 && (
          <p className="run-composer__hint">No sections returned by the API.</p>
        )}
        <ul className="run-composer__sections">
          {sections.map((section) => (
            <li key={section.id}>
              <label className="run-composer__section">
                <input
                  type="checkbox"
                  checked={selected.has(section.id)}
                  onChange={() => toggleSection(section.id)}
                />
                <span>
                  <span className="run-composer__section-title">{section.title}</span>
                  <span className="run-composer__section-id">
                    {section.id}
                    {section.order != null ? ` · order ${section.order}` : ""}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {structureHint && (
          <p className="run-composer__hint">
            Structure (first selected): {structureHint}
          </p>
        )}
      </fieldset>

      <label className="run-composer__field">
        <span>Instruction</span>
        <textarea
          rows={3}
          value={instruction}
          disabled={locked}
          placeholder="Focus on revenue normalization…"
          onChange={(e) => {
            setInstruction(e.target.value);
            onClearStartError?.();
          }}
        />
      </label>

      <fieldset className="run-composer__fieldset" disabled={locked}>
        <legend>Approval policy</legend>
        <label className="run-composer__radio">
          <input
            type="radio"
            name="approval_policy"
            checked={policy === "balanced"}
            onChange={() => setPolicy("balanced")}
          />
          <span>
            <strong>Balanced</strong> — ~5 approvals per section (load-bearing gates
            only). Recommended default.
          </span>
        </label>
        <label className="run-composer__radio">
          <input
            type="radio"
            name="approval_policy"
            checked={policy === "thorough"}
            onChange={() => setPolicy("thorough")}
          />
          <span>
            <strong>Thorough</strong> — ~16 approvals per section (every step plan +
            review) plus the global gate. Pair with bulk-approve in review (task 08).
          </span>
        </label>
      </fieldset>

      {providers.length > 0 && (
        <label className="run-composer__field">
          <span>Provider override (optional)</span>
          <select
            value={providerOverride}
            disabled={locked}
            onChange={(e) => setProviderOverride(e.target.value)}
          >
            <option value="">Use server default</option>
            {providers.map((p) => (
              <option key={p.provider} value={p.provider} disabled={!p.key_present}>
                {p.provider}
                {p.default_model ? ` · ${p.default_model}` : ""}
                {!p.key_present ? " (no key)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {(validationError || startError) && (
        <div className="run-composer__error" role="alert">
          {validationError ?? startError}
        </div>
      )}

      <div className="run-composer__actions">
        <button
          type="button"
          className="btn-primary"
          disabled={!canStart || selected.size === 0}
          title={
            !databookReady
              ? "Upload a databook and wait until Ready"
              : selected.size === 0
                ? "Select at least one section"
                : locked
                  ? "Run already started"
                  : "Start generation"
          }
          onClick={handleStart}
        >
          {starting ? "Starting…" : locked ? "Running…" : "Start generation"}
        </button>
      </div>
    </section>
  );
}
