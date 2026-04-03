"use client";

import { TrendingDown, TrendingUp } from "lucide-react";

import { WatchlistToggle } from "@/components/watchlist/WatchlistToggle";
import { AnnualFundamentalsSection } from "@/components/stock/AnnualFundamentalsSection";
import { DividendChartsSection } from "@/components/stock/DividendChartsSection";
import { FundamentalsChartsSection } from "@/components/stock/FundamentalsChartsSection";
import { IncomeStatementTable } from "@/components/stock/IncomeStatementTable";
import { InvestorMetricsSection } from "@/components/stock/InvestorMetricsSection";
import { StockMetricChart } from "@/components/stock/StockMetricChart";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";
import { translateStockError } from "@/lib/i18n/messages";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { cn } from "@/lib/utils";

type StockAnalysisViewProps = {
  ticker: string;
  bundle: StockAnalysisBundle | null;
  error: string | null;
};

export function StockAnalysisView({ ticker, bundle, error }: StockAnalysisViewProps) {
  const { t } = useI18n();
  const symbol = ticker.trim().toUpperCase() || "AAPL";
  const errorText = error ? translateStockError(t, error) : null;

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
  const positive = quote.changesPercentage >= 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{quote.name}</h1>
            <Badge variant="secondary" className="font-mono text-xs">
              {quote.symbol}
            </Badge>
            <WatchlistToggle symbol={quote.symbol} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("stock.subtitle")}</p>
        </div>
        <div className="flex min-w-0 shrink-0 flex-wrap items-baseline gap-2 sm:gap-3">
          <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
            {formatCurrency(quote.price)}
          </span>
          <span
            className={cn(
              "flex items-center gap-1 font-mono text-sm font-medium tabular-nums",
              positive ? "text-emerald-400" : "text-red-400"
            )}
          >
            {positive ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
            {formatPercent(quote.changesPercentage)}
            <span className="text-muted-foreground">({formatCurrency(quote.change)})</span>
          </span>
        </div>
      </div>

      <StockMetricChart data={bundle} />
      <IncomeStatementTable rows={income} />
      <FundamentalsChartsSection data={bundle} />
      <DividendChartsSection data={bundle} />
      <AnnualFundamentalsSection data={bundle} />
      <InvestorMetricsSection data={bundle.investor} />
    </div>
  );
}
