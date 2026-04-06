"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { StockAnalysisView } from "@/components/stock/StockAnalysisView";
import { debugLogStockBundle } from "@/lib/stockDebugConsole";
import type {
  StockAnalysisLoadProgress,
  StockAnalysisPageLoadProgress,
} from "@/lib/stockLoadProgress";
import { stockLoadProgressPercent } from "@/lib/stockLoadProgress";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

type Props = {
  ticker: string;
};

type NdjsonLine =
  | { type: "progress"; payload: StockAnalysisLoadProgress }
  | { type: "done"; bundle: StockAnalysisBundle | null; error: string | null };

export function StockAnalysisPageClient({ ticker }: Props) {
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
      const sym = ticker.trim() || "AAPL";
      setLoading(true);
      setError(null);
      setLoadProgress({ event: null, percent: 4, connecting: true });
      void (async () => {
        try {
          const qs = `ticker=${encodeURIComponent(sym)}${forceRefresh ? "&refresh=1" : ""}&stream=1`;
          const res = await fetch(`/api/stock-analysis?${qs}`, { signal: ac.signal });

          if (!res.ok) {
            const data = (await res.json()) as { bundle?: unknown; error?: string | null };
            if (cancelled) return;
            setBundle(null);
            setError(data.error ?? `HTTP ${res.status}`);
            setLoadProgress(null);
            return;
          }

          const reader = res.body?.getReader();
          if (!reader) {
            if (!cancelled) setError("Could not load stock data.");
            setLoadProgress(null);
            return;
          }

          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              let msg: NdjsonLine;
              try {
                msg = JSON.parse(line) as NdjsonLine;
              } catch {
                continue;
              }
              if (msg.type === "progress") {
                if (cancelled) continue;
                setLoadProgress({
                  event: msg.payload,
                  percent: stockLoadProgressPercent(msg.payload),
                  connecting: false,
                });
              }
              if (msg.type === "done") {
                if (cancelled) continue;
                setBundle(msg.bundle);
                setError(msg.error);
                setLoadProgress(null);
              }
            }
          }
        } catch (e) {
          if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
          if (!cancelled) setError("Could not load stock data.");
          setLoadProgress(null);
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
      loadProgress={loadProgress}
      onForceRefresh={handleForceRefresh}
    />
  );
}
