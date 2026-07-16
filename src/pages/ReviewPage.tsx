import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
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

/**
 * Excel Auditor review workspace — errors listed in the left sidebar.
 * Opened from DatabookPanel when ingestion audit fails (`/review/:auditId`).
 */
export default function ReviewPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const id = auditId!;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("return") || "/";

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
  const [reingesting, setReingesting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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
        setLoadError(null);
        setTotalFiltered(data.total);
        setListErrors((prev) => {
          const merged = reset ? data.errors : [...prev, ...data.errors];
          setAllLoaded(merged.length >= data.total);
          return merged;
        });
        setCurrentPage(page);
        if (data.sheets_with_errors) {
          setSheetsWithErrors(new Set(data.sheets_with_errors));
          // Seed tabs immediately if /sheets is still pending on a huge workbook.
          setSheetNames((prev) =>
            prev.length > 0 ? prev : [...data.sheets_with_errors]
          );
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load errors");
      } finally {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    },
    [id, currentFilter, currentSheet]
  );

  useEffect(() => {
    let cancelled = false;
    api
      .fetchSheets(id)
      .then((names) => {
        if (!cancelled) setSheetNames(names);
      })
      .catch((err) => {
        console.error("[fiscalflow] fetchSheets failed", err);
        if (!cancelled) setSheetNames([]);
      });
    updateProgress().catch(() => undefined);
    return () => {
      cancelled = true;
    };
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
    setSheetData(null);
    try {
      const data = await api.fetchSheetData(id, detail.sheet_name, detail.cell_address, 8);
      setSheetData(data);
    } catch (err) {
      setSheetData({
        error: err instanceof Error ? err.message : "Failed to load sheet",
      } as SheetData);
    } finally {
      setSheetLoading(false);
    }
  };

  const selectSheet = async (sheetName: string | null) => {
    setCurrentSheet(sheetName);
    if (sheetName) {
      setSheetPreview(true);
      setSheetLoading(true);
      setSheetData(null);
      try {
        const data = await api.fetchSheetData(id, sheetName, "A1", 12);
        setSheetData(data);
      } catch (err) {
        setSheetData({
          error: err instanceof Error ? err.message : "Failed to load sheet",
        } as SheetData);
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
      (e) =>
        e.fix_status !== "resolved" &&
        e.fix_status !== "auto_fixed" &&
        e.fix_status !== "skipped"
    );
    if (unresolved.length > 0) void selectError(unresolved[0].id);
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
    if (currentError?.suggested_fix) void handleApply(currentError.suggested_fix);
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
        prev.map((e) =>
          e.id === data.undone!.error_id ? { ...e, fix_status: "needs_human" } : e
        )
      );
      setErrorDetailCache((c) => {
        const next = { ...c };
        delete next[data.undone!.error_id];
        return next;
      });
      await updateProgress();
      if (currentError?.id === data.undone.error_id) void selectError(currentError.id);
    }
  };

  const handleSaveReport = async () => {
    const data = await api.saveReport(id);
    if (data.success) alert("Report saved to: " + data.path);
  };

  const handleReingest = async () => {
    setReingesting(true);
    try {
      const result = await api.reingestAudit(id);
      if (result.passed) {
        navigate(returnTo);
      } else {
        alert(result.summary || "Audit still failing — keep fixing critical issues.");
        await loadErrorPage(1, true);
        await updateProgress();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Re-ingest failed");
    } finally {
      setReingesting(false);
    }
  };

  const pct =
    progress.total > 0 ? ((progress.resolved + progress.skipped) / progress.total) * 100 : 0;
  const progressText = `${progress.resolved} fixed / ${progress.total} total`;

  return (
    <div className="app audit-review-app">
      <TopBar
        progressPct={pct}
        progressText={progressText}
        onUndo={() => {
          void handleUndo();
        }}
        onDownload={() => window.open(api.downloadUrl(id), "_blank")}
        onSaveReport={() => {
          void handleSaveReport();
        }}
        leading={
          <Link to={returnTo} className="topbar-btn topbar-back">
            ← Back to run
          </Link>
        }
        trailing={
          <button
            type="button"
            className="topbar-btn topbar-btn--accent"
            disabled={reingesting}
            onClick={() => {
              void handleReingest();
            }}
          >
            {reingesting ? "Re-checking…" : "Re-check & ingest"}
          </button>
        }
      />
      {loadError && (
        <div className="audit-review-banner" role="alert">
          {loadError}
        </div>
      )}
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
          onSelect={(errorId) => {
            void selectError(errorId);
          }}
          onLoadMore={() => {
            void loadErrorPage(currentPage + 1, false);
          }}
        />
      </div>
      <SheetViewer data={sheetData} loading={sheetLoading} preview={sheetPreview} />
      <SheetTabsBar
        sheetNames={sheetNames}
        sheetsWithErrors={sheetsWithErrors}
        currentSheet={currentSheet}
        onSelectSheet={(name) => {
          void selectSheet(name);
        }}
      />
      <div className="detail-panel">
        <ErrorDetails error={currentError} />
        <FixEditor
          error={currentError}
          sheetNames={sheetNames}
          onApply={(formula) => {
            void handleApply(formula);
          }}
          onAcceptSuggestion={handleAcceptSuggestion}
          onSkip={() => {
            void handleSkip();
          }}
        />
        <DepChain error={currentError} />
      </div>
    </div>
  );
}
