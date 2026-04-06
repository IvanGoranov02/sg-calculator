"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { StockAnalysisView } from "@/components/stock/StockAnalysisView";
import { debugLogStockBundle } from "@/lib/stockDebugConsole";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

type Props = {
  ticker: string;
};

export function StockAnalysisPageClient({ ticker }: Props) {
  const [bundle, setBundle] = useState<StockAnalysisBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const cancelRef = useRef<() => void>(undefined);

  const fetchData = useCallback(
    (forceRefresh: boolean) => {
      cancelRef.current?.();
      let cancelled = false;
      cancelRef.current = () => { cancelled = true; };
      const sym = ticker.trim() || "AAPL";
      setLoading(true);
      setError(null);
      void (async () => {
        try {
          const qs = `ticker=${encodeURIComponent(sym)}${forceRefresh ? "&refresh=1" : ""}`;
          const res = await fetch(`/api/stock-analysis?${qs}`);
          const data = (await res.json()) as { bundle: StockAnalysisBundle | null; error?: string | null };
          if (cancelled) return;
          if (!res.ok) {
            setBundle(null);
            setError(data.error ?? `HTTP ${res.status}`);
            return;
          }
          setBundle(data.bundle ?? null);
          setError(data.error ?? null);
        } catch {
          if (!cancelled) setError("Could not load stock data.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    },
    [ticker],
  );

  useEffect(() => {
    fetchData(false);
    return () => { cancelRef.current?.(); };
  }, [fetchData]);

  const handleForceRefresh = useCallback(() => fetchData(true), [fetchData]);

  useEffect(() => {
    if (loading) return;
    const sym = ticker.trim().toUpperCase() || "AAPL";
    debugLogStockBundle(sym, bundle, error);
  }, [loading, bundle, error, ticker]);

  return (
    <StockAnalysisView
      ticker={ticker}
      bundle={bundle}
      error={error}
      loading={loading}
      onForceRefresh={handleForceRefresh}
    />
  );
}
