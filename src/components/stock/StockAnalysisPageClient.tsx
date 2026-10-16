"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { StockAnalysisView } from "@/components/stock/StockAnalysisView";
import { debugLogStockBundle } from "@/lib/stockDebugConsole";
import { pushRecentStockSearch } from "@/lib/stockRecentSearches";
import { fetchStockAnalysisStream } from "@/lib/stockAnalysisStreamClient";
import type { StockAnalysisPageLoadProgress } from "@/lib/stockLoadProgress";
import { stockLoadProgressPercent } from "@/lib/stockLoadProgress";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

type Props = {
  ticker: string;
};

export function StockAnalysisPageClient({ ticker }: Props) {
  const { status: sessionStatus } = useSession();
  const [bundle, setBundle] = useState<StockAnalysisBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState<StockAnalysisPageLoadProgress | null>({
    event: null,
    percent: 4,
    connecting: true,
  });
  const cancelRef = useRef<() => void>(undefined);

  const fetchData = useCallback(
    (forceRefresh: boolean) => {
      cancelRef.current?.();
      let cancelled = false;
      const ac = new AbortController();
      cancelRef.current = () => {
        cancelled = true;
        ac.abort();
      };
      const sym = ticker.trim();
      if (!sym) {
        setBundle(null);
        setError(null);
        setLoading(false);
        setLoadProgress(null);
        return;
      }
      setLoading(true);
      setBundle(null);
      setError(null);
      setLoadProgress({ event: null, percent: 4, connecting: true });
      void (async () => {
        try {
          const qs = `ticker=${encodeURIComponent(sym)}${forceRefresh ? "&refresh=1" : ""}&stream=1`;
          const result = await fetchStockAnalysisStream(`/api/stock-analysis?${qs}`, {
            signal: ac.signal,
            onProgress: (payload) => {
              if (cancelled) return;
              setLoadProgress({
                event: payload,
                percent: stockLoadProgressPercent(payload),
                connecting: false,
              });
            },
          });
          if (cancelled) return;
          setBundle(result.bundle);
          setError(result.error);
          setLoadProgress(null);
          if (result.bundle) {
            pushRecentStockSearch(result.bundle.quote.symbol, result.bundle.quote.name);
          }
        } catch (e) {
          if (cancelled) return;
          setBundle(null);
          setError(e instanceof Error ? e.message : "Could not load stock data.");
          setLoadProgress(null);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    },
    [ticker],
  );

  useEffect(() => {
    let active = true;
    // StrictMode immediately cleans up its first effect; avoid starting that discarded request.
    queueMicrotask(() => { if (active) fetchData(false); });
    return () => {
      active = false;
      cancelRef.current?.();
    };
  }, [fetchData]);

  const handleForceRefresh = useCallback(() => fetchData(true), [fetchData]);
  const handleRetry = useCallback(() => fetchData(false), [fetchData]);

  useEffect(() => {
    if (loading) return;
    const sym = ticker.trim().toUpperCase();
    if (!sym) return;
    debugLogStockBundle(sym, bundle, error);
  }, [loading, bundle, error, ticker]);

  return (
    <StockAnalysisView
      ticker={ticker}
      bundle={bundle}
      error={error}
      loading={loading}
      loadProgress={loadProgress}
      onForceRefresh={sessionStatus === "authenticated" ? handleForceRefresh : undefined}
      onRetry={handleRetry}
    />
  );
}
