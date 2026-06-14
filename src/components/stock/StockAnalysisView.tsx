"use client";

import { AnnualFundamentalsSection } from "@/components/stock/AnnualFundamentalsSection";
import { DividendChartsSection } from "@/components/stock/DividendChartsSection";
import { FundamentalsChartsSection } from "@/components/stock/FundamentalsChartsSection";
import { IncomeStatementTable } from "@/components/stock/IncomeStatementTable";
import { InvestorMetricsSection } from "@/components/stock/InvestorMetricsSection";
import { StockAiSection } from "@/components/stock/StockAiSection";
import { StockLiveHeader } from "@/components/stock/StockLiveHeader";
import { StockLoadProgressBar } from "@/components/stock/StockLoadProgressBar";
import { StockMetricChart } from "@/components/stock/StockMetricChart";
import { StockNewsSection } from "@/components/stock/StockNewsSection";
import type { StockAnalysisPageLoadProgress } from "@/lib/stockLoadProgress";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { translateStockError } from "@/lib/i18n/messages";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { StockAnalysisPeriodProvider } from "@/lib/stockAnalysisPeriod";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { readBundleDataSource } from "@/lib/stockCache";

type StockAnalysisViewProps = {
  ticker: string;
  bundle: StockAnalysisBundle | null;
  error: string | null;
  loading?: boolean;
  loadProgress?: StockAnalysisPageLoadProgress | null;
  onForceRefresh?: () => void;
  onRetry?: () => void;
};

function DataSourceBadge({ bundle }: { bundle: StockAnalysisBundle }) {
  const { t } = useI18n();
  const source = readBundleDataSource(bundle);
  const styles = {
    edgar: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    admin: "border-sky-500/40 bg-sky-500/10 text-sky-400",
    gemini: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  } as const;
  return (
    <span
      className={`shrink-0 cursor-help rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${styles[source]}`}
      title={t(
        source === "edgar"
          ? "stock.sourceEdgarHint"
          : source === "admin"
            ? "stock.sourceAdminHint"
            : "stock.sourceGeminiHint",
      )}
    >
      {t(
        source === "edgar"
          ? "stock.sourceEdgar"
          : source === "admin"
            ? "stock.sourceAdmin"
            : "stock.sourceGemini",
      )}
    </span>
  );
}

export function StockAnalysisView({
  ticker,
  bundle,
  error,
  loading = false,
  loadProgress = null,
  onForceRefresh,
  onRetry,
}: StockAnalysisViewProps) {
  const { t } = useI18n();
  const symbol = ticker.trim().toUpperCase() || "AAPL";
  const errorText = error ? translateStockError(t, error) : null;

  if (loading && !bundle) {
    return (
      <div className="mx-auto flex min-w-0 max-w-6xl flex-col gap-8">
        {loadProgress ? (
          <div className="rounded-xl border border-emerald-500/20 bg-zinc-900/70 p-4 shadow-inner shadow-black/20">
            <StockLoadProgressBar
              event={loadProgress.event}
              percent={loadProgress.percent}
              connecting={loadProgress.connecting}
            />
          </div>
        ) : null}
        <div className="space-y-3 rounded-xl border border-white/10 bg-zinc-900/40 p-5 animate-pulse">
          <div className="h-8 w-2/3 rounded bg-zinc-800" />
          <div className="h-4 w-1/3 rounded bg-zinc-800/80" />
          <div className="mt-4 h-24 rounded-lg bg-zinc-800/60" />
        </div>
        <div className="h-12 w-40 rounded-lg bg-zinc-800/70 animate-pulse" />
        <div className="h-72 rounded-xl border border-white/5 bg-zinc-900/30 animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-56 rounded-xl border border-white/5 bg-zinc-900/25 animate-pulse" />
          ))}
        </div>
        {!loadProgress ? (
          <p className="text-center text-sm text-muted-foreground">{t("stock.loadingSections")}</p>
        ) : null}
      </div>
    );
  }

  if (error && !bundle) {
    return (
      <Card className="max-w-lg border-red-500/20 bg-zinc-900/50">
        <CardHeader>
          <CardTitle>{t("stock.couldNotLoad", { symbol })}</CardTitle>
          <CardDescription className="text-red-300/90">{errorText}</CardDescription>
          {onRetry ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 w-fit"
              onClick={onRetry}
              disabled={loading}
            >
              {loading ? t("stock.refreshing") : t("stock.tryAgain")}
            </Button>
          ) : null}
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

  const { quote, eurPerUsd } = bundle;

  return (
    <StockAnalysisPeriodProvider key={symbol}>
      <div className="mx-auto flex min-w-0 max-w-6xl flex-col gap-8">
        {loading && loadProgress ? (
          <div className="rounded-xl border border-emerald-500/20 bg-zinc-900/70 p-4 shadow-inner shadow-black/20">
            <StockLoadProgressBar
              event={loadProgress.event}
              percent={loadProgress.percent}
              connecting={loadProgress.connecting}
            />
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <StockLiveHeader quote={quote} eurPerUsd={eurPerUsd} />
          </div>
          <DataSourceBadge bundle={bundle} />
          {onForceRefresh && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 text-xs"
              onClick={onForceRefresh}
              disabled={loading}
            >
              {loading ? t("stock.refreshing") : t("stock.refreshData")}
            </Button>
          )}
        </div>

        <StockAiSection symbol={symbol} />

        <StockMetricChart data={bundle} />
        <FundamentalsChartsSection data={bundle} symbol={symbol} />
        <DividendChartsSection data={bundle} />
        <AnnualFundamentalsSection data={bundle} />
        <IncomeStatementTable bundle={bundle} />
        <InvestorMetricsSection data={bundle.investor} />
        <StockNewsSection symbol={symbol} name={bundle.quote.name} />
      </div>
    </StockAnalysisPeriodProvider>
  );
}
