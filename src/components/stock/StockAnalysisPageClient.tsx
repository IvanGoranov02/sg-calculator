"use client";

import { useEffect, useState } from "react";

import { StockAnalysisView } from "@/components/stock/StockAnalysisView";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

type Props = {
  ticker: string;
};

export function StockAnalysisPageClient({ ticker }: Props) {
  const [bundle, setBundle] = useState<StockAnalysisBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const sym = ticker.trim() || "AAPL";
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/stock-analysis?ticker=${encodeURIComponent(sym)}`);
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
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return (
    <StockAnalysisView
      ticker={ticker}
      bundle={bundle}
      error={error}
      loading={loading}
      onBundleReplace={setBundle}
    />
  );
}
