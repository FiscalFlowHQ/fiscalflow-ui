import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/http";
import { listSections } from "../api/fiscalflow";
import type { SectionCatalogItem } from "../types/api";

export type UseSectionCatalogResult = {
  sections: SectionCatalogItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

function sortSections(sections: SectionCatalogItem[]): SectionCatalogItem[] {
  return [...sections].sort((a, b) => {
    const ao = a.order ?? Number.POSITIVE_INFINITY;
    const bo = b.order ?? Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;
    return a.title.localeCompare(b.title);
  });
}

/** Fetches `GET /sections` — no hardcoded catalog (matches live BE registry). */
export function useSectionCatalog(): UseSectionCatalogResult {
  const [sections, setSections] = useState<SectionCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listSections();
      setSections(sortSections(res.sections ?? []));
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.status === 404
            ? "Section catalog unavailable (GET /sections not found on the API)."
            : err.detail
          : err instanceof Error
            ? err.message
            : "Failed to load sections";
      setError(message);
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sections, loading, error, refresh };
}
