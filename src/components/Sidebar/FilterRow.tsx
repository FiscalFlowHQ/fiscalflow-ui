const FILTERS = [
  { id: "all", label: "All" },
  { id: "needs_human", label: "Needs Fix" },
  { id: "suggested", label: "Suggested" },
  { id: "resolved", label: "Done" },
] as const;

interface FilterRowProps {
  current: string;
  onChange: (filter: string) => void;
}

export default function FilterRow({ current, onChange }: FilterRowProps) {
  return (
    <div className="filter-row">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          className={`filter-btn${current === f.id ? " active" : ""}`}
          onClick={() => onChange(f.id)}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
