import { useEffect, useRef } from "react";
import type { ErrorListItem } from "../../types";
import { getBadgeClass } from "../../utils/badges";
import ErrorItem from "./ErrorItem";

interface ErrorListProps {
  errors: ErrorListItem[];
  totalFiltered: number;
  allLoaded: boolean;
  loadingMore: boolean;
  currentErrorId: string | null;
  expandedGroups: Set<string>;
  onToggleGroup: (addr: string) => void;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
}

export default function ErrorList({
  errors,
  totalFiltered,
  allLoaded,
  loadingMore,
  currentErrorId,
  expandedGroups,
  onToggleGroup,
  onSelect,
  onLoadMore,
}: ErrorListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handler = () => {
      if (allLoaded || loadingMore) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) onLoadMore();
    };
    el.addEventListener("scroll", handler);
    return () => el.removeEventListener("scroll", handler);
  }, [allLoaded, loadingMore, onLoadMore]);

  const rootAddresses: Record<string, ErrorListItem> = {};
  for (const e of errors) {
    if (e.full_address) rootAddresses[e.full_address] = e;
  }

  const roots: ErrorListItem[] = [];
  const childrenOf: Record<string, ErrorListItem[]> = {};

  for (const e of errors) {
    const rc = e.root_cause_cell;
    if (rc && rootAddresses[rc]) {
      if (!childrenOf[rc]) childrenOf[rc] = [];
      childrenOf[rc].push(e);
    } else {
      roots.push(e);
    }
  }

  return (
    <div className="error-list" ref={listRef}>
      {roots.map((root) => {
        const addr = root.full_address || "";
        const children = childrenOf[addr] || [];

        if (children.length > 0) {
          const isExpanded = expandedGroups.has(addr);
          const bc = getBadgeClass(root.error_category, root.fix_status);
          return (
            <div key={addr}>
              <div
                className={`error-group-header${isExpanded ? " expanded" : ""}`}
                onClick={() => onToggleGroup(addr)}
                onKeyDown={(ev) => ev.key === "Enter" && onToggleGroup(addr)}
                role="button"
                tabIndex={0}
              >
                <span className="expand-arrow">&#x25B6;</span>
                <div className="group-info">
                  <div className="group-addr">
                    <span className={`error-badge ${bc}`} style={{ marginRight: 6 }}>
                      {root.error_category}
                    </span>
                    {addr}
                  </div>
                  <div className="group-count">
                    {children.length + 1} errors ({children.length} dependent)
                  </div>
                </div>
              </div>
              {isExpanded && (
                <>
                  <ErrorItem error={root} active={currentErrorId === root.id} onSelect={onSelect} />
                  <div className="error-group-children">
                    {children.map((c) => (
                      <ErrorItem key={c.id} error={c} active={currentErrorId === c.id} onSelect={onSelect} />
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        }

        return <ErrorItem key={root.id} error={root} active={currentErrorId === root.id} onSelect={onSelect} />;
      })}

      {!allLoaded && (
        <div style={{ padding: 12, textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
          Loading more... ({errors.length} / {totalFiltered})
        </div>
      )}
      {allLoaded && errors.length === 0 && (
        <div style={{ padding: 20, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
          No errors match this filter
        </div>
      )}
      {allLoaded && errors.length > 0 && (
        <div style={{ padding: 8, textAlign: "center", color: "var(--text-dim)", fontSize: 11 }}>
          {errors.length} of {totalFiltered} shown
        </div>
      )}
    </div>
  );
}
