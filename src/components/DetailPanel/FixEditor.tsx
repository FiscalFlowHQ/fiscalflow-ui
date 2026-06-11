import { useEffect, useState } from "react";
import type { ErrorEntry } from "../../types";
import { esc } from "../../utils/badges";

interface FixEditorProps {
  error: ErrorEntry | null;
  sheetNames: string[];
  onApply: (formula: string) => void;
  onAcceptSuggestion: () => void;
  onSkip: () => void;
}

export default function FixEditor({ error: e, sheetNames, onApply, onAcceptSuggestion, onSkip }: FixEditorProps) {
  const [formula, setFormula] = useState("");

  useEffect(() => {
    if (e) {
      setFormula(e.suggested_fix || e.formula || "");
    }
  }, [e]);

  if (!e) {
    return (
      <div className="detail-section" id="fixEditor">
        <h3>Fix Formula</h3>
        <div id="fixEditorContent" style={{ color: "var(--text-dim)", fontSize: 13 }}>
          Select an error to edit
        </div>
      </div>
    );
  }

  const isResolved = e.fix_status === "resolved" || e.fix_status === "auto_fixed";
  const showSheetPicker =
    e.error_category === "MISSING_SHEET" || (e.formula && e.formula.includes("!"));

  const insertSheetRef = (sheet: string) => {
    if (!sheet) return;
    const ref = sheet.includes(" ") ? `'${sheet}'` : sheet;
    setFormula((f) => f + ref + "!");
  };

  return (
    <div className="detail-section" id="fixEditor">
      <h3>Fix Formula</h3>
      <div id="fixEditorContent">
        {isResolved && (
          <div style={{ color: "var(--success)", fontSize: 13, marginBottom: 10 }}>
            &#x2713; This error has been resolved
          </div>
        )}
        {e.suggested_fix && !isResolved && (
          <div className="suggestion-box">
            <div style={{ fontWeight: 500, marginBottom: 4 }}>&#x1F4A1; Suggested Fix</div>
            <code style={{ fontSize: 12 }}>{esc(e.suggested_fix)}</code>
            {e.suggestion_confidence != null && (
              <div className="conf">Confidence: {Math.round(e.suggestion_confidence * 100)}%</div>
            )}
          </div>
        )}
        <textarea
          className="formula-editor"
          id="formulaInput"
          value={formula}
          onChange={(ev) => setFormula(ev.target.value)}
        />
        {showSheetPicker && (
          <>
            <label style={{ fontSize: 11, color: "var(--text-dim)" }}>Insert sheet reference:</label>
            <select
              className="sheet-select"
              id="sheetPicker"
              defaultValue=""
              onChange={(ev) => {
                insertSheetRef(ev.target.value);
                ev.target.value = "";
              }}
            >
              <option value="">— select sheet —</option>
              {sheetNames.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </>
        )}
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={() => onApply(formula)}>
            &#x2713; Apply Fix
          </button>
          {e.suggested_fix && !isResolved && (
            <button type="button" className="btn btn-success" onClick={onAcceptSuggestion}>
              Accept Suggestion
            </button>
          )}
          <button type="button" className="btn" onClick={onSkip}>
            Skip &#x2192;
          </button>
        </div>
      </div>
    </div>
  );
}
