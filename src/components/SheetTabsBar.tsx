import { useRef } from "react";

interface SheetTabsBarProps {
  sheetNames: string[];
  sheetsWithErrors: Set<string>;
  currentSheet: string | null;
  onSelectSheet: (sheet: string | null) => void;
}

export default function SheetTabsBar({
  sheetNames,
  sheetsWithErrors,
  currentSheet,
  onSelectSheet,
}: SheetTabsBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  const onSearch = (query: string) => {
    const bar = barRef.current;
    if (!bar) return;
    const buttons = bar.querySelectorAll(".sheet-tab-btn");
    const q = query.toLowerCase().trim();
    if (!q) {
      buttons.forEach((b) => b.classList.remove("highlight"));
      return;
    }
    let firstMatch: Element | null = null;
    buttons.forEach((b) => {
      const name = b.textContent?.toLowerCase() || "";
      if (name.includes(q)) {
        b.classList.add("highlight");
        if (!firstMatch) firstMatch = b;
      } else {
        b.classList.remove("highlight");
      }
    });
    if (firstMatch && bar) {
      const el = firstMatch as HTMLElement;
      const scrollLeft = el.offsetLeft - bar.offsetWidth / 2 + el.offsetWidth / 2;
      bar.scrollTo({ left: Math.max(0, scrollLeft), behavior: "smooth" });
    }
  };

  return (
    <div className="sheet-tabs-wrap">
      <input
        type="text"
        className="sheet-search"
        id="sheetSearch"
        placeholder="Search Sheet"
        onInput={(e) => onSearch(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <button
        type="button"
        className={`sheet-tab-btn${currentSheet === null ? " active" : ""}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSelectSheet(null)}
      >
        All Sheets
      </button>
      <div className="sheet-tabs-divider" />
      <div className="sheet-tabs-bar" ref={barRef} id="sheetTabsBar">
        {sheetNames.map((sn) => (
          <button
            key={sn}
            type="button"
            className={`sheet-tab-btn${currentSheet === sn ? " active" : ""}${
              sheetsWithErrors.has(sn) ? " has-errors" : ""
            }`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelectSheet(sn)}
          >
            {sn}
          </button>
        ))}
      </div>
    </div>
  );
}
