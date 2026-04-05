"use client";

import { AnnualFundamentalsSection } from "@/components/stock/AnnualFundamentalsSection";
import { DividendChartsSection } from "@/components/stock/DividendChartsSection";
import { FundamentalsChartsSection } from "@/components/stock/FundamentalsChartsSection";
import { IncomeStatementTable } from "@/components/stock/IncomeStatementTable";
import { InvestorMetricsSection } from "@/components/stock/InvestorMetricsSection";
import { StockAiSection } from "@/components/stock/StockAiSection";
import { StockLiveHeader } from "@/components/stock/StockLiveHeader";
import { StockMetricChart } from "@/components/stock/StockMetricChart";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { translateStockError } from "@/lib/i18n/messages";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

type StockAnalysisViewProps = {
  ticker: string;
  bundle: StockAnalysisBundle | null;
  error: string | null;
  loading?: boolean;
  onBundleReplace?: (bundle: StockAnalysisBundle) => void;
};

export function StockAnalysisView({
  ticker,
  bundle,
  error,
  loading = false,
  onBundleReplace,
}: StockAnalysisViewProps) {
  const { t } = useI18n();
  const symbol = ticker.trim().toUpperCase() || "AAPL";
  const errorText = error ? translateStockError(t, error) : null;

  if (loading && !bundle) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="space-y-3 rounded-xl border border-white/10 bg-zinc-900/40 p-5 animate-pulse">
          <div className="h-8 w-2/3 rounded bg-zinc-800" />
          <div className="h-4 w-1/3 rounded bg-zinc-800/80" />
          <div className="mt-4 h-24 rounded-lg bg-zinc-800/60" />
        </div>
        <div className="h-12 w-40 rounded-lg bg-zinc-800/70 animate-pulse" />
        <div className="h-72 rounded-xl border border-white/5 bg-zinc-900/30 animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-56 rounded-xl border border-white/5 bg-zinc-900/25 animate-pulse" />
          ))}
        </div>
        <p className="text-center text-sm text-muted-foreground">{t("stock.loadingSections")}</p>
      </div>
    );
  }

  if (error && !bundle) {
    return (
      <Card className="max-w-lg border-red-500/20 bg-zinc-900/50">
        <CardHeader>
          <CardTitle>{t("stock.couldNotLoad", { symbol })}</CardTitle>
          <CardDescription className="text-red-300/90">{errorText}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!bundle) {
    return (
      <Card className="max-w-lg border-white/10 bg-zinc-900/50">
        <CardHeader>
          <CardTitle>{t("stock.noData")}</CardTitle>
          <CardDescription>{t("stock.searchValid")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { quote, income } = bundle;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <StockLiveHeader quote={quote} />

      <StockAiSection symbol={symbol} />

      <StockMetricChart data={bundle} />
      <FundamentalsChartsSection data={bundle} symbol={symbol} onBundleReplace={onBundleReplace} />
      <DividendChartsSection data={bundle} />
      <IncomeStatementTable rows={income} />
      <AnnualFundamentalsSection data={bundle} />
      <InvestorMetricsSection data={bundle.investor} />
    </div>
  );
}
