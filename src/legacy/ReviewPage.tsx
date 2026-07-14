import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import * as api from "../api/client";
import TopBar from "../components/TopBar";
import FilterRow from "../components/Sidebar/FilterRow";
import ErrorList from "../components/Sidebar/ErrorList";
import SheetViewer from "../components/SheetViewer";
import SheetTabsBar from "../components/SheetTabsBar";
import ErrorDetails from "../components/DetailPanel/ErrorDetails";
import FixEditor from "../components/DetailPanel/FixEditor";
import DepChain from "../components/DetailPanel/DepChain";
import type { ErrorEntry, ErrorListItem, Progress, SheetData } from "../types";

const PER_PAGE = 50;

export default function ReviewPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const id = auditId!;

  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [listErrors, setListErrors] = useState<ErrorListItem[]>([]);
  const [currentError, setCurrentError] = useState<ErrorEntry | null>(null);
  const [currentFilter, setCurrentFilter] = useState("needs_human");
  const [currentSheet, setCurrentSheet] = useState<string | null>(null);
  const [sheetsWithErrors, setSheetsWithErrors] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [errorDetailCache, setErrorDetailCache] = useState<Record<string, ErrorEntry>>({});
  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetPreview, setSheetPreview] = useState(false);
  const [progress, setProgress] = useState<Progress>({
    total: 0,
    resolved: 0,
    skipped: 0,
    remaining: 0,
    history_count: 0,
  });

  const loadingMoreRef = useRef(false);

  const updateProgress = useCallback(async () => {
    const p = await api.fetchProgress(id);
    setProgress(p);
  }, [id]);

  const loadErrorPage = useCallback(
    async (page: number, reset: boolean) => {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
      try {
        const data = await api.fetchErrors(id, {
          page,
          perPage: PER_PAGE,
          status: currentFilter,
          sheet: currentSheet,
        });
        setTotalFiltered(data.total);
        setListErrors((prev) => {
          const merged = reset ? data.errors : [...prev, ...data.errors];
          setAllLoaded(merged.length >= data.total);
          return merged;
        });
        setCurrentPage(page);
        if (data.sheets_with_errors) {
          setSheetsWithErrors(new Set(data.sheets_with_errors));
        }
      } finally {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    },
    [id, currentFilter, currentSheet]
  );

  useEffect(() => {
    api.fetchSheets(id).then(setSheetNames);
    updateProgress();
  }, [id, updateProgress]);

  useEffect(() => {
    setErrorDetailCache({});
    setExpandedGroups(new Set());
    loadErrorPage(1, true);
  }, [currentFilter, currentSheet, loadErrorPage]);

  const selectError = async (errorId: string) => {
    let detail = errorDetailCache[errorId];
    if (!detail) {
      detail = await api.fetchError(id, errorId);
      setErrorDetailCache((c) => ({ ...c, [errorId]: detail }));
    }
    setCurrentError(detail);
    setSheetPreview(false);
    setSheetLoading(true);
    try {
      const data = await api.fetchSheetData(id, detail.sheet_name, detail.cell_address, 8);
      setSheetData(data);
    } finally {
      setSheetLoading(false);
    }
  };

  const selectSheet = async (sheetName: string | null) => {
    setCurrentSheet(sheetName);
    if (sheetName) {
      setSheetPreview(true);
      setSheetLoading(true);
      try {
        const data = await api.fetchSheetData(id, sheetName, "A1", 12);
        setSheetData(data);
      } finally {
        setSheetLoading(false);
      }
    } else {
      setSheetPreview(false);
      if (!currentError) setSheetData(null);
    }
  };

  const goToNextError = () => {
    const unresolved = listErrors.filter(
      (e) => e.fix_status !== "resolved" && e.fix_status !== "auto_fixed" && e.fix_status !== "skipped"
    );
    if (unresolved.length > 0) selectError(unresolved[0].id);
  };

  const handleApply = async (formula: string) => {
    if (!currentError || !formula.trim()) {
      alert("Formula cannot be empty");
      return;
    }
    const data = await api.applyFix(id, {
      error_id: currentError.id,
      formula: formula.trim(),
      sheet_name: currentError.sheet_name,
      cell_address: currentError.cell_address,
    });
    if (data.success) {
      setListErrors((prev) =>
        prev.map((e) => (e.id === currentError.id ? { ...e, fix_status: "resolved" } : e))
      );
      setErrorDetailCache((c) => {
        const next = { ...c };
        delete next[currentError.id];
        return next;
      });
      await updateProgress();
      goToNextError();
    } else {
      alert("Fix failed: " + (data.error || "Unknown error"));
    }
  };

  const handleAcceptSuggestion = () => {
    if (currentError?.suggested_fix) handleApply(currentError.suggested_fix);
  };

  const handleSkip = async () => {
    if (!currentError) return;
    await api.skipError(id, currentError.id);
    setListErrors((prev) =>
      prev.map((e) => (e.id === currentError.id ? { ...e, fix_status: "skipped" } : e))
    );
    setErrorDetailCache((c) => {
      const next = { ...c };
      delete next[currentError.id];
      return next;
    });
    await updateProgress();
    goToNextError();
  };

  const handleUndo = async () => {
    const data = await api.undoFix(id);
    if (data.success && data.undone) {
      setListErrors((prev) =>
        prev.map((e) => (e.id === data.undone!.error_id ? { ...e, fix_status: "needs_human" } : e))
      );
      setErrorDetailCache((c) => {
        const next = { ...c };
        delete next[data.undone!.error_id];
        return next;
      });
      await updateProgress();
      if (currentError?.id === data.undone.error_id) selectError(currentError.id);
    }
  };

  const handleSaveReport = async () => {
    const data = await api.saveReport(id);
    if (data.success) alert("Report saved to: " + data.path);
  };

  const pct = progress.total > 0 ? ((progress.resolved + progress.skipped) / progress.total) * 100 : 0;
  const progressText = `${progress.resolved} fixed / ${progress.total} total`;

  return (
    <div className="app">
      <TopBar
        progressPct={pct}
        progressText={progressText}
        onUndo={handleUndo}
        onDownload={() => window.open(api.downloadUrl(id), "_blank")}
        onSaveReport={handleSaveReport}
      />
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>Errors to Review</h2>
          <FilterRow current={currentFilter} onChange={setCurrentFilter} />
        </div>
        <ErrorList
          errors={listErrors}
          totalFiltered={totalFiltered}
          allLoaded={allLoaded}
          loadingMore={loadingMore}
          currentErrorId={currentError?.id ?? null}
          expandedGroups={expandedGroups}
          onToggleGroup={(addr) => {
            setExpandedGroups((prev) => {
              const next = new Set(prev);
              if (next.has(addr)) next.delete(addr);
              else next.add(addr);
              return next;
            });
          }}
          onSelect={selectError}
          onLoadMore={() => loadErrorPage(currentPage + 1, false)}
        />
      </div>
      <SheetViewer data={sheetData} loading={sheetLoading} preview={sheetPreview} />
      <SheetTabsBar
        sheetNames={sheetNames}
        sheetsWithErrors={sheetsWithErrors}
        currentSheet={currentSheet}
        onSelectSheet={selectSheet}
      />
      <div className="detail-panel">
        <ErrorDetails error={currentError} />
        <FixEditor
          error={currentError}
          sheetNames={sheetNames}
          onApply={handleApply}
          onAcceptSuggestion={handleAcceptSuggestion}
          onSkip={handleSkip}
        />
        <DepChain error={currentError} />
      </div>
    </div>
  );
}
