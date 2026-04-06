"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { annualDisplayFiscalYears, useStockAnalysisPeriod } from "@/lib/stockAnalysisPeriod";
import { debugLogAnnualTable } from "@/lib/stockDebugConsole";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

type AnnualTablesGeminiStripProps = {
  data: StockAnalysisBundle;
  symbol: string;
  onBundleReplace?: (bundle: StockAnalysisBundle) => void;
};

export function AnnualTablesGeminiStrip({ data, symbol, onBundleReplace }: AnnualTablesGeminiStripProps) {
  const { t } = useI18n();
  const { timeRange, customFromYear, customToYear } = useStockAnalysisPeriod();
  const [busy, setBusy] = useState(false);

  const displayYears = useMemo(
    () => annualDisplayFiscalYears(data, timeRange, customFromYear, customToYear),
    [data, timeRange, customFromYear, customToYear],
  );

  const loadedFiscalYears = useMemo(
    () => [...new Set(data.income.map((r) => r.fiscalYear))].sort((a, b) => a.localeCompare(b)),
    [data.income],
  );

  const loadedSet = useMemo(() => new Set(loadedFiscalYears), [loadedFiscalYears]);

  const missingYears = useMemo(
    () => displayYears.filter((y) => !loadedSet.has(y)),
    [displayYears, loadedSet],
  );

  useEffect(() => {
    debugLogAnnualTable(symbol, {
      timeRange,
      customFromYear,
      customToYear,
      displayYears: [...displayYears],
      loadedFiscalYears: [...loadedFiscalYears],
      missingYears: [...missingYears],
      rawAnnualIncomeRows: data.income.length,
    });
  }, [
    symbol,
    timeRange,
    customFromYear,
    customToYear,
    displayYears,
    loadedFiscalYears,
    missingYears,
    data.income.length,
  ]);

  const runGeminiFill = useCallback(async () => {
    if (!onBundleReplace) return;
    setBusy(true);
    try {
      const res = await fetch("/api/stock/gemini-balance-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: symbol, bundle: data }),
      });
      const j = (await res.json()) as { ok?: boolean; bundle?: StockAnalysisBundle };
      if (j.bundle && j.ok) onBundleReplace(j.bundle);
    } finally {
      setBusy(false);
    }
  }, [onBundleReplace, symbol, data]);

  if (!onBundleReplace || missingYears.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-2 text-sm text-muted-foreground">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-400/90" aria-hidden />
        <p>
          {t("annual.geminiStripBody", {
            missing: missingYears.length,
            total: displayYears.length,
          })}
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="shrink-0 gap-2"
        disabled={busy}
        onClick={runGeminiFill}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
        {busy ? t("chartsFund.loadAgainGeminiBusy") : t("chartsFund.loadAgainGemini")}
      </Button>
    </div>
  );
}
