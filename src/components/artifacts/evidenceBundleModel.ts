/**
 * Human-readable rendering helpers for distill `evidence_bundle` (and similar
 * topic-keyed evidence objects). Live bundles are often:
 *   { company_overview: { evidence, key_message, table_data? }, … }
 * or the older { summary, citations } / { by_subsection, data_gaps } shapes.
 */

export type EvidenceTopic = {
  id: string;
  title: string;
  keyMessage: string | null;
  evidence: string | null;
  tableCaption: string | null;
  tableRows: Record<string, unknown>[];
  extra: Record<string, unknown>;
};

export type NormalizedEvidenceBundle = {
  summary: string | null;
  citations: string[];
  dataGaps: string[];
  topics: EvidenceTopic[];
  /** Leftover keys we could not classify — shown collapsed as JSON fallback. */
  residual: Record<string, unknown> | null;
};

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && "text" in item) {
        return asString((item as { text?: unknown }).text) ?? "";
      }
      if (item && typeof item === "object" && "gap" in item) {
        return asString((item as { gap?: unknown }).gap) ?? "";
      }
      try {
        return JSON.stringify(item);
      } catch {
        return String(item);
      }
    })
    .filter(Boolean);
}

function topicFromValue(id: string, value: unknown): EvidenceTopic | null {
  if (value == null) return null;
  if (typeof value === "string") {
    return {
      id,
      title: humanizeKey(id),
      keyMessage: null,
      evidence: value.trim() || null,
      tableCaption: null,
      tableRows: [],
      extra: {},
    };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return {
      id,
      title: humanizeKey(id),
      keyMessage: null,
      evidence: (() => {
        try {
          return JSON.stringify(value, null, 2);
        } catch {
          return String(value);
        }
      })(),
      tableCaption: null,
      tableRows: [],
      extra: {},
    };
  }

  const obj = value as Record<string, unknown>;
  const known = new Set([
    "evidence",
    "key_message",
    "keyMessage",
    "summary",
    "table_caption",
    "tableCaption",
    "table_data",
    "tableData",
    "citations",
  ]);
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!known.has(k) && v != null && v !== "") extra[k] = v;
  }

  const evidence =
    asString(obj.evidence) ??
    asString(obj.summary) ??
    (typeof obj.text === "string" ? obj.text : null);

  const tableRows = Array.isArray(obj.table_data)
    ? (obj.table_data.filter((r) => r && typeof r === "object") as Record<string, unknown>[])
    : Array.isArray(obj.tableData)
      ? (obj.tableData.filter((r) => r && typeof r === "object") as Record<string, unknown>[])
      : [];

  return {
    id,
    title: humanizeKey(id),
    keyMessage: asString(obj.key_message) ?? asString(obj.keyMessage),
    evidence,
    tableCaption: asString(obj.table_caption) ?? asString(obj.tableCaption),
    tableRows,
    extra,
  };
}

const META_KEYS = new Set([
  "summary",
  "citations",
  "data_gaps",
  "dataGaps",
  "by_subsection",
  "bySubsection",
  "shared",
]);

export function normalizeEvidenceBundle(raw: unknown): NormalizedEvidenceBundle {
  if (raw == null) {
    return { summary: null, citations: [], dataGaps: [], topics: [], residual: null };
  }

  if (typeof raw === "string") {
    return {
      summary: raw.trim() || null,
      citations: [],
      dataGaps: [],
      topics: [],
      residual: null,
    };
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      summary: null,
      citations: [],
      dataGaps: [],
      topics: [],
      residual: { value: raw },
    };
  }

  const root = raw as Record<string, unknown>;
  const summary = asString(root.summary);
  const citations = asStringList(root.citations);
  const dataGaps = asStringList(root.data_gaps ?? root.dataGaps);

  const topics: EvidenceTopic[] = [];
  const residual: Record<string, unknown> = {};

  const subsection =
    root.by_subsection && typeof root.by_subsection === "object" && !Array.isArray(root.by_subsection)
      ? (root.by_subsection as Record<string, unknown>)
      : root.bySubsection &&
          typeof root.bySubsection === "object" &&
          !Array.isArray(root.bySubsection)
        ? (root.bySubsection as Record<string, unknown>)
        : null;

  if (subsection) {
    for (const [id, value] of Object.entries(subsection)) {
      const topic = topicFromValue(id, value);
      if (topic) topics.push(topic);
    }
  }

  if (root.shared != null) {
    const topic = topicFromValue("shared", root.shared);
    if (topic) topics.push(topic);
  }

  for (const [key, value] of Object.entries(root)) {
    if (META_KEYS.has(key)) continue;
    const topic = topicFromValue(key, value);
    if (topic && (topic.evidence || topic.keyMessage || topic.tableRows.length)) {
      topics.push(topic);
    } else if (value != null && typeof value === "object") {
      // Nested leftovers without evidence-ish shape
      residual[key] = value;
    } else if (value != null && value !== "") {
      residual[key] = value;
    }
  }

  return {
    summary,
    citations,
    dataGaps,
    topics,
    residual: Object.keys(residual).length ? residual : null,
  };
}

export function evidenceBundleHasReadableContent(bundle: NormalizedEvidenceBundle): boolean {
  return Boolean(
    bundle.summary ||
      bundle.citations.length ||
      bundle.dataGaps.length ||
      bundle.topics.length
  );
}
