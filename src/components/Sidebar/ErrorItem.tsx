import type { ErrorListItem } from "../../types";
import { getBadgeClass, trunc } from "../../utils/badges";

interface ErrorItemProps {
  error: ErrorListItem;
  active: boolean;
  onSelect: (id: string) => void;
}

export default function ErrorItem({ error: e, active, onSelect }: ErrorItemProps) {
  const isResolved = e.fix_status === "resolved" || e.fix_status === "auto_fixed";
  const bc = getBadgeClass(e.error_category, e.fix_status);
  const bt = isResolved ? "FIXED" : e.error_category;

  return (
    <div
      className={`error-item${active ? " active" : ""}${isResolved ? " resolved" : ""}`}
      onClick={() => onSelect(e.id)}
      onKeyDown={(ev) => ev.key === "Enter" && onSelect(e.id)}
      role="button"
      tabIndex={0}
    >
      <div className="error-item-header">
        <span className="error-item-id">{e.id}</span>
        <span className={`error-badge ${bc}`}>{bt}</span>
      </div>
      <div className="error-item-addr">{e.full_address}</div>
      <div className="error-item-desc">{trunc(e.explanation || "", 60)}</div>
    </div>
  );
}
