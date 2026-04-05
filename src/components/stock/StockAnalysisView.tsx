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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <StockLiveHeader quote={quote} />

      <StockAiSection symbol={symbol} />

      <StockMetricChart data={bundle} />
      <FundamentalsChartsSection data={bundle} />
      <DividendChartsSection data={bundle} />
      <IncomeStatementTable rows={income} />
      <AnnualFundamentalsSection data={bundle} />
      <InvestorMetricsSection data={bundle.investor} />
    </div>
  );
}
