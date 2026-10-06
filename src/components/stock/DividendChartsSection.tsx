"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";

import { FundamentalChartCard, type FundamentalSeries } from "@/components/stock/FundamentalChartCard";
import { Button } from "@/components/ui/button";
import { growthPillsForKey } from "@/lib/growthPills";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { filterDividendQuarterlyByPeriod, quarterlyFilterYearBounds, useStockAnalysisPeriod } from "@/lib/stockAnalysisPeriod";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { sortQuarterlyByDateAsc } from "@/lib/stockAnalysisTypes";
import { cn } from "@/lib/utils";

type DividendChartsSectionProps = {
  data: StockAnalysisBundle;
};

export function DividendChartsSection({ data }: DividendChartsSectionProps) {
  const { t, locale } = useI18n();
  const dividendCurrency = data.investor.currency || "USD";
  const { timeRange, customFromYear, customToYear } = useStockAnalysisPeriod();
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const formatPeriod = useCallback(
    (dateIso: string) => {
      const d = new Date(`${dateIso}T12:00:00Z`);
      return d.toLocaleDateString(locale === "bg" ? "bg-BG" : "en-US", {
        month: "short",
        year: "2-digit",
      });
    },
    [locale],
  );

  const quarterBounds = useMemo(
    () =>
      quarterlyFilterYearBounds({
        incomeQuarterly: data.incomeQuarterly,
        dividendQuarterly: data.dividendQuarterly,
      }),
    [data.incomeQuarterly, data.dividendQuarterly],
  );

  const pack = useMemo(() => {
    const allSorted = sortQuarterlyByDateAsc(data.dividendQuarterly);
    const allRows = allSorted.map((p) => ({ qDps: p.dividendPerShare }));
    const qDpsPills = growthPillsForKey(allRows, "qDps", "quarterly");

    const filtered = filterDividendQuarterlyByPeriod(
      data.dividendQuarterly,
      timeRange,
      customFromYear,
      customToYear,
      quarterBounds,
    );
    const sorted = sortQuarterlyByDateAsc(filtered);
    const hasDps = sorted.some((p) => p.dividendPerShare != null && p.dividendPerShare > 0);
    const rows = sorted.map((p) => ({
      periodEnd: p.date.slice(0, 10),
      label: formatPeriod(p.date),
      qDps: p.dividendPerShare,
    }));
    return { rows, hasDps, qDpsPills };
  }, [data.dividendQuarterly, formatPeriod, timeRange, customFromYear, customToYear, quarterBounds]);

  const showsDividend = useMemo(() => {
    const inv = data.investor;
    if (inv.dividendRate != null && inv.dividendRate > 0) return true;
    const y = inv.dividendYield;
    if (y != null) {
      const frac = y > 1 ? y / 100 : y;
      if (frac > 1e-6) return true;
    }
    if (data.dividendQuarterly.some((p) => p.dividendPerShare != null && p.dividendPerShare > 0))
      return true;
    return false;
  }, [data.investor, data.dividendQuarterly]);

  const qDpsSeries: FundamentalSeries[] = useMemo(
    () => [{ dataKey: "qDps", color: "#fb923c", label: t("chartsFund.dividendQtrPerShare") }],
    [t],
  );

  const onReloadYahoo = () => {
    startRefresh(() => {
      router.refresh();
    });
  };

  if (data.dividendQuarterly.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight">{t("chartsFund.dividendSectionTitle")}</h2>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRefreshing}
            onClick={onReloadYahoo}
            className="border-border bg-card"
          >
            <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
            {t("chartsFund.dividendRefreshData")}
          </Button>
        </div>
      </div>

      {!pack.hasDps ? (
        <p className="text-base font-medium text-foreground sm:text-lg">
          {showsDividend ? t("chartsFund.dividendDataIncomplete") : t("chartsFund.dividendNonPayer")}
        </p>
      ) : (
        <FundamentalChartCard
          title={t("chartsFund.dividendQtrChartTitle")}
          description={t("chartsFund.dividendQtrChartDesc")}
          xKey="periodEnd"
          xLabelFormatter={formatPeriod}
          data={pack.rows}
          series={qDpsSeries}
          chartType="bar"
          valueFormat="perShare"
          currency={dividendCurrency}
          growthPills={[{ pills: pack.qDpsPills }]}
        />
      )}
    </div>
  );
}
