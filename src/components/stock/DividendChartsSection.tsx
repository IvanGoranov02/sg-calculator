"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";

import { FundamentalChartCard, type FundamentalSeries } from "@/components/stock/FundamentalChartCard";
import { Button } from "@/components/ui/button";
import { buildAnnualChartRows, buildQuarterlyChartRows } from "@/lib/fundamentalsChartRows";
import { growthPillsForKey } from "@/lib/growthPills";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import {
  computePayoutRatioPercent,
  computeTrailingPayoutRatios,
  sumQuarterlyDpsForFiscalYear,
} from "@/lib/payoutRatio";
import {
  filterAnnualRowsByPeriod,
  filterDividendQuarterlyByPeriod,
  filterQuarterlyChartRowsByPeriod,
  quarterlyFilterYearBounds,
  useStockAnalysisPeriod,
} from "@/lib/stockAnalysisPeriod";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { sortIncomeByYearAsc, sortQuarterlyByDateAsc } from "@/lib/stockAnalysisTypes";
import { cn } from "@/lib/utils";

type DividendChartsSectionProps = {
  data: StockAnalysisBundle;
};

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function DividendChartsSection({ data }: DividendChartsSectionProps) {
  const { t, locale } = useI18n();
  const dividendCurrency = data.investor.currency || "USD";
  const { timeRange, freq, customFromYear, customToYear } = useStockAnalysisPeriod();
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
  const formatYear = useCallback((fy: string) => t("chart.fyYear", { y: fy }), [t]);

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

  const payoutPack = useMemo(() => {
    const dpsByDate = new Map(
      data.dividendQuarterly.map((p) => [p.date.slice(0, 10), p.dividendPerShare] as const),
    );

    if (freq === "annual") {
      const baseRows = buildAnnualChartRows(data, formatYear);
      const incFiltered = filterAnnualRowsByPeriod(
        sortIncomeByYearAsc(data.income),
        timeRange,
        customFromYear,
        customToYear,
      );
      const allowed = new Set(incFiltered.map((r) => r.fiscalYear));
      const filtered = baseRows.filter(
        (r) => typeof r.fiscalYear === "string" && allowed.has(r.fiscalYear),
      );
      const allPayout = baseRows.map((r) => {
        const fy = typeof r.fiscalYear === "string" ? r.fiscalYear : "";
        const dps = fy ? sumQuarterlyDpsForFiscalYear(fy, data.dividendQuarterly) : null;
        return {
          payoutRatio: computePayoutRatioPercent({
            dps,
            eps: numOrNull(r.dilutedEps),
            dividendsPaid: numOrNull(r.dividendsPaid),
            netIncome: numOrNull(r.netIncome),
          }),
        };
      });
      const rows = filtered.map((r) => {
        const fy = typeof r.fiscalYear === "string" ? r.fiscalYear : "";
        const dps = fy ? sumQuarterlyDpsForFiscalYear(fy, data.dividendQuarterly) : null;
        return {
          label: String(r.label ?? fy),
          fiscalYear: fy,
          periodEnd: typeof r.periodEnd === "string" ? r.periodEnd : undefined,
          payoutRatio: computePayoutRatioPercent({
            dps,
            eps: numOrNull(r.dilutedEps),
            dividendsPaid: numOrNull(r.dividendsPaid),
            netIncome: numOrNull(r.netIncome),
          }),
        };
      });
      return {
        rows,
        pills: growthPillsForKey(allPayout, "payoutRatio", "annual"),
        hasPoints: rows.some((r) => r.payoutRatio != null),
      };
    }

    const baseRows = buildQuarterlyChartRows(data, formatPeriod, locale);
    if (!quarterBounds) {
      return {
        rows: [] as Record<string, unknown>[],
        pills: growthPillsForKey([], "payoutRatio", "quarterly"),
        hasPoints: false,
      };
    }
    const filtered = filterQuarterlyChartRowsByPeriod(
      baseRows,
      timeRange,
      customFromYear,
      customToYear,
      quarterBounds,
    );

    // TTM payout: trailing 4Q DPS/EPS (or cash dividends / NI) so quarterly bars stay comparable.
    const inputs = baseRows.map((r) => {
      const pe = typeof r.periodEnd === "string" ? r.periodEnd.slice(0, 10) : "";
      return {
        dps: pe ? (dpsByDate.get(pe) ?? null) : null,
        eps: numOrNull(r.dilutedEps),
        dividendsPaid: numOrNull(r.dividendsPaid),
        netIncome: numOrNull(r.netIncome),
      };
    });
    const allTrailing = computeTrailingPayoutRatios(inputs, 4);
    const peToPayout = new Map<string, number | null>();
    baseRows.forEach((r, i) => {
      const pe = typeof r.periodEnd === "string" ? r.periodEnd.slice(0, 10) : "";
      if (pe) peToPayout.set(pe, allTrailing[i] ?? null);
    });

    const allPayout = allTrailing.map((payoutRatio) => ({ payoutRatio }));
    const rows = filtered.map((r) => {
      const pe = typeof r.periodEnd === "string" ? r.periodEnd.slice(0, 10) : "";
      return {
        periodEnd: pe,
        label: String(r.label ?? ""),
        payoutRatio: pe ? (peToPayout.get(pe) ?? null) : null,
      };
    });
    return {
      rows,
      pills: growthPillsForKey(allPayout, "payoutRatio", "quarterly"),
      hasPoints: rows.some((r) => r.payoutRatio != null),
    };
  }, [
    data,
    freq,
    formatYear,
    formatPeriod,
    locale,
    timeRange,
    customFromYear,
    customToYear,
    quarterBounds,
  ]);

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

  const payoutSeries: FundamentalSeries[] = useMemo(
    () => [{ dataKey: "payoutRatio", color: "#34d399", label: t("chartsFund.payoutRatioSeries") }],
    [t],
  );

  const payoutAxisProps = useMemo(
    () =>
      freq === "quarterly"
        ? { xKey: "periodEnd" as const, xLabelFormatter: formatPeriod }
        : {},
    [freq, formatPeriod],
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
        <div className="flex flex-col gap-6">
          <FundamentalChartCard
            title={t("chartsFund.dividendQtrChartTitle")}
            xKey="periodEnd"
            xLabelFormatter={formatPeriod}
            data={pack.rows}
            series={qDpsSeries}
            chartType="bar"
            valueFormat="perShare"
            currency={dividendCurrency}
            growthPills={[{ pills: pack.qDpsPills }]}
            hideCoverageNote
          />
          {payoutPack.hasPoints ? (
            <FundamentalChartCard
              {...payoutAxisProps}
              title={t("chartsFund.payoutRatioChartTitle")}
              data={payoutPack.rows}
              series={payoutSeries}
              chartType="bar"
              valueFormat="percent"
              growthPills={[{ pills: payoutPack.pills }]}
              hideCoverageNote
            />
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
              <p className="text-sm font-medium text-muted-foreground">
                {t("chartsFund.payoutRatioEmpty")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
