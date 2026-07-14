import { useCallback, useEffect, useRef, useState } from "react";
import { downloadDocument, getSessionState } from "../api/fiscalflow";
import { ApiError } from "../api/http";
import {
  normalizeCompletedSections,
  normalizeCrossReview,
  normalizeFindings,
  normalizeSectionState,
  liveSectionId,
} from "../components/artifacts/artifactModel";
import { triggerBlobDownload } from "../lib/downloadBlob";
import {
  availableExportFormats,
  exportFilename,
} from "../lib/exportFormats";
import type {
  CompletedSection,
  CrossSectionReview,
  DocumentFormat,
  Finding,
  InterruptEnvelope,
  ReportValues,
  SectionState,
} from "../types/api";
import type { SseEvent } from "../types/sse";

export type ArtifactTab = "live" | "sections" | "evidence" | "findings" | "report";

export type UseArtifactStateOptions = {
  threadId: string;
  /** Poll GET /state while streaming/paused so sections/evidence catch up. */
  pollMs?: number;
};

export type UseArtifactStateResult = {
  tab: ArtifactTab;
  setTab: (tab: ArtifactTab) => void;
  values: ReportValues | null;
  completedSections: CompletedSection[];
  priorFindings: Finding[];
  crossReview: CrossSectionReview | null;
  sectionState: SectionState | null;
  liveText: string;
  liveNode: string;
  autoScroll: boolean;
  setAutoScroll: (value: boolean) => void;
  reportMarkdown: string | null;
  reportLoading: boolean;
  reportError: string | null;
  stateError: string | null;
  runStatus: string | null;
  /** Formats present in `metadata.artifacts` (md / pptx / pdf). */
  exportFormats: DocumentFormat[];
  exportBusy: DocumentFormat | null;
  exportError: string | null;
  downloadExport: (format: DocumentFormat) => Promise<void>;
  clearExportError: () => void;
  applyEvent: (ev: SseEvent) => void;
  seedFromInterrupt: (envelope: InterruptEnvelope) => void;
  refreshState: () => Promise<void>;
  loadReport: () => Promise<void>;
  reset: () => void;
};

export function useArtifactState(options: UseArtifactStateOptions): UseArtifactStateResult {
  const { threadId, pollMs = 4000 } = options;

  const [tab, setTab] = useState<ArtifactTab>("live");
  const [values, setValues] = useState<ReportValues | null>(null);
  const [completedSections, setCompletedSections] = useState<CompletedSection[]>([]);
  const [priorFindings, setPriorFindings] = useState<Finding[]>([]);
  const [crossReview, setCrossReview] = useState<CrossSectionReview | null>(null);
  const [sectionState, setSectionState] = useState<SectionState | null>(null);
  const [liveText, setLiveText] = useState("");
  const [liveNode, setLiveNode] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [reportMarkdown, setReportMarkdown] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [exportFormats, setExportFormats] = useState<DocumentFormat[]>([]);
  const [exportBusy, setExportBusy] = useState<DocumentFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const pendingChunks = useRef<string[]>([]);
  const pendingNode = useRef("");
  const rafId = useRef<number | null>(null);
  const liveBuiltFromTokens = useRef(false);

  const flushTokens = useCallback(() => {
    rafId.current = null;
    if (!pendingChunks.current.length) return;
    const chunk = pendingChunks.current.join("");
    pendingChunks.current = [];
    if (!chunk) return;
    liveBuiltFromTokens.current = true;
    setLiveNode(pendingNode.current);
    setLiveText((prev) => prev + chunk);
  }, []);

  const queueToken = useCallback(
    (text: string, node: string) => {
      if (node) pendingNode.current = node;
      pendingChunks.current.push(text);
      if (rafId.current == null) {
        rafId.current = requestAnimationFrame(flushTokens);
      }
    },
    [flushTokens]
  );

  const applySnapshot = useCallback(
    (snapshot: {
      values: ReportValues;
      section_state?: SectionState | null;
    }) => {
      const nextValues = snapshot.values ?? {};
      setValues(nextValues);
      setCompletedSections(normalizeCompletedSections(nextValues.completed_sections));
      setPriorFindings(normalizeFindings(nextValues.prior_findings));
      setCrossReview(normalizeCrossReview(nextValues.metadata?.cross_section_review));
      const ss = normalizeSectionState(snapshot.section_state ?? null);
      setSectionState(ss);
      const status =
        typeof nextValues.run_status === "string" ? nextValues.run_status : null;
      setRunStatus(status);
      setExportFormats(availableExportFormats(nextValues.metadata?.artifacts));

      // Rebuild Live from checkpoint draft when we have no token stream (reconnect).
      if (!liveBuiltFromTokens.current && typeof ss?.draft === "string" && ss.draft) {
        setLiveText(ss.draft);
        setLiveNode(liveSectionId(ss) ? `section:${liveSectionId(ss)}` : "section_state.draft");
      }
    },
    []
  );

  const refreshState = useCallback(async () => {
    try {
      const state = await getSessionState(threadId);
      setStateError(null);
      applySnapshot(state);
    } catch (err) {
      setStateError(
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : "Failed to load GET /state"
      );
    }
  }, [applySnapshot, threadId]);

  const loadReport = useCallback(async () => {
    setReportLoading(true);
    setReportError(null);
    try {
      const blob = await downloadDocument(threadId, "md");
      const text = await blob.text();
      setReportMarkdown(text);
    } catch (err) {
      setReportMarkdown(null);
      if (err instanceof ApiError && err.status === 404) {
        setReportError("Report not ready yet (run must be completed).");
      } else {
        setReportError(
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : "Failed to load report"
        );
      }
    } finally {
      setReportLoading(false);
    }
  }, [threadId]);

  const downloadExport = useCallback(
    async (format: DocumentFormat) => {
      if (exportBusy) return;
      setExportBusy(format);
      setExportError(null);
      try {
        const blob = await downloadDocument(threadId, format);
        if (format === "md") {
          const text = await blob.text();
          setReportMarkdown(text);
          triggerBlobDownload(
            new Blob([text], { type: "text/markdown;charset=utf-8" }),
            exportFilename(threadId, format)
          );
        } else {
          triggerBlobDownload(blob, exportFilename(threadId, format));
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setExportError(
            `${format.toUpperCase()} is not available for this run (feature-detect from metadata.artifacts).`
          );
        } else if (err instanceof ApiError && err.status === 422) {
          setExportError(err.detail || "Unknown export format.");
        } else {
          setExportError(
            err instanceof ApiError
              ? err.detail
              : err instanceof Error
                ? err.message
                : "Export failed"
          );
        }
      } finally {
        setExportBusy(null);
      }
    },
    [exportBusy, threadId]
  );

  const reset = useCallback(() => {
    if (rafId.current != null) cancelAnimationFrame(rafId.current);
    rafId.current = null;
    pendingChunks.current = [];
    pendingNode.current = "";
    liveBuiltFromTokens.current = false;
    setTab("live");
    setValues(null);
    setCompletedSections([]);
    setPriorFindings([]);
    setCrossReview(null);
    setSectionState(null);
    setLiveText("");
    setLiveNode("");
    setReportMarkdown(null);
    setReportError(null);
    setStateError(null);
    setRunStatus(null);
    setExportFormats([]);
    setExportBusy(null);
    setExportError(null);
    setPolling(false);
  }, []);

  const applyEvent = useCallback(
    (ev: SseEvent) => {
      if (ev.type === "token") {
        setPolling(true);
        queueToken(ev.text, ev.node || "");
        return;
      }
      if (ev.type === "step") {
        setPolling(true);
        return;
      }
      if (ev.type === "interrupt") {
        setPolling(true);
        void refreshState();
        return;
      }
      if (ev.type === "done") {
        setPolling(false);
        liveBuiltFromTokens.current = true;
        void refreshState().then(() => {
          void loadReport();
        });
        return;
      }
      if (ev.type === "error") {
        setPolling(false);
        void refreshState();
      }
    },
    [loadReport, queueToken, refreshState]
  );

  const seedFromInterrupt = useCallback((envelope: InterruptEnvelope) => {
    const content = envelope.content ?? {};
    const draft = content.draft;
    if (typeof draft === "string" && draft && !liveBuiltFromTokens.current) {
      setLiveText(draft);
      setLiveNode(envelope.step_id || envelope.section_id || "interrupt.draft");
    }
  }, []);

  useEffect(() => {
    if (!threadId || !polling || pollMs <= 0) return;
    const id = window.setInterval(() => {
      void refreshState();
    }, pollMs);
    return () => window.clearInterval(id);
  }, [threadId, polling, pollMs, refreshState]);

  useEffect(() => {
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, []);

  // Auto-load report markdown when switching to Report tab if completed.
  useEffect(() => {
    if (
      tab === "report" &&
      runStatus === "completed" &&
      reportMarkdown == null &&
      !reportLoading
    ) {
      void loadReport();
    }
  }, [tab, runStatus, reportMarkdown, reportLoading, loadReport]);

  return {
    tab,
    setTab,
    values,
    completedSections,
    priorFindings,
    crossReview,
    sectionState,
    liveText,
    liveNode,
    autoScroll,
    setAutoScroll,
    reportMarkdown,
    reportLoading,
    reportError,
    stateError,
    runStatus,
    exportFormats,
    exportBusy,
    exportError,
    downloadExport,
    clearExportError: () => setExportError(null),
    applyEvent,
    seedFromInterrupt,
    refreshState,
    loadReport,
    reset,
  };
}
