import type { InterruptEnvelope, ResumeRequest } from "../../types/api";
import InterruptCard from "./InterruptCard";

export type InterruptStackProps = {
  current: InterruptEnvelope | null;
  queueLength: number;
  resuming: boolean;
  resumeError: string | null;
  bulkApprovePlans: boolean;
  onBulkApproveChange: (value: boolean) => void;
  onResume: (request: ResumeRequest, envelope: InterruptEnvelope) => void;
  onDismissError?: () => void;
};

export default function InterruptStack({
  current,
  queueLength,
  resuming,
  resumeError,
  bulkApprovePlans,
  onBulkApproveChange,
  onResume,
  onDismissError,
}: InterruptStackProps) {
  return (
    <section className="hitl-stack" aria-label="Human review">
      <header className="hitl-stack__head">
        <h2 className="hitl-stack__title">Review</h2>
        {queueLength > 1 && (
          <span className="hitl-stack__queue">{queueLength} queued</span>
        )}
      </header>

      <label className="hitl-bulk">
        <input
          type="checkbox"
          checked={bulkApprovePlans}
          disabled={resuming}
          onChange={(e) => onBulkApproveChange(e.target.checked)}
        />
        <span>
          Auto-approve remaining <strong>plan</strong> gates for this run (thorough
          mode helper). Review and clarification pauses still show a card.
        </span>
      </label>

      {!current ? (
        <p className="hitl-stack__empty">No pending interrupt.</p>
      ) : (
        <InterruptCard
          envelope={current}
          busy={resuming}
          error={resumeError}
          onResume={(request, envelope) => {
            onDismissError?.();
            onResume(request, envelope);
          }}
        />
      )}

      {resumeError && !current && (
        <div className="hitl-card__error" role="alert">
          {resumeError}
        </div>
      )}
    </section>
  );
}
