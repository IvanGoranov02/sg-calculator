"use client";

import { useCallback, useMemo } from "react";

import { FiscalMetricTable, type FiscalMetricRowDef } from "@/components/stock/FiscalMetricTable";
import { safePct, safeRatio, yoyPercentNullableSeries, yoyPercentSeries } from "@/lib/annualTables";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { sortIncomeByYearAsc } from "@/lib/stockAnalysisTypes";

type AnnualFundamentalsSectionProps = {
  data: StockAnalysisBundle;
};

function byFy<T extends { fiscalYear: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.fiscalYear, r]));
}

export function AnnualFundamentalsSection({ data }: AnnualFundamentalsSectionProps) {
  const { t } = useI18n();
  const formatFy = useCallback((y: string) => t("chart.fyYear", { y }), [t]);

  const pack = useMemo(() => {
    const inc = sortIncomeByYearAsc(data.income);
    const years = inc.map((r) => r.fiscalYear);
    const cfMap = byFy(data.cashFlow);
    const bsMap = byFy(data.balanceSheet);

    const perShare: FiscalMetricRowDef[] = [
      {
        label: t("annual.dilutedEps"),
        values: inc.map((r) => r.dilutedEps ?? null),
        format: "eps",
      },
      {
        label: t("annual.dilutedShares"),
        values: inc.map((r) => r.dilutedAverageShares ?? null),
        format: "shares",
      },
    ];

    const incomeExtra: FiscalMetricRowDef[] = [
      {
        label: t("annual.operatingIncome"),
        values: inc.map((r) => r.operatingIncome ?? null),
        format: "currency",
      },
      {
        label: t("annual.ebitda"),
        values: inc.map((r) => r.ebitda ?? null),
        format: "currency",
      },
    ];

    const revenues = inc.map((r) => r.revenue);
    const netIncomes = inc.map((r) => r.netIncome);
    const gps = inc.map((r) => r.grossProfit);
    const fcfSeries = years.map((y) => {
      const c = cfMap.get(y);
      return c ? c.freeCashFlow : null;
    });

    const yoyRows: FiscalMetricRowDef[] = [
      { label: t("annual.revYoy"), values: yoyPercentSeries(revenues), format: "yoy" },
      { label: t("annual.niYoy"), values: yoyPercentSeries(netIncomes), format: "yoy" },
      { label: t("annual.gpYoy"), values: yoyPercentSeries(gps), format: "yoy" },
      { label: t("annual.fcfYoy"), values: yoyPercentNullableSeries(fcfSeries), format: "yoy" },
    ];

    const margins: FiscalMetricRowDef[] = [
      {
        label: t("annual.grossMargin"),
        values: inc.map((r) => safePct(r.grossProfit, r.revenue)),
        format: "margin",
      },
      {
        label: t("annual.operatingMargin"),
        values: inc.map((r) =>
          r.operatingIncome != null ? safePct(r.operatingIncome, r.revenue) : null,
        ),
        format: "margin",
      },
      {
        label: t("annual.netMargin"),
        values: inc.map((r) => safePct(r.netIncome, r.revenue)),
        format: "margin",
      },
      {
        label: t("annual.fcfMargin"),
        values: years.map((y, i) => {
          const c = cfMap.get(y);
          const rev = inc[i]?.revenue;
          if (c == null || rev == null || rev === 0) return null;
          return safePct(c.freeCashFlow, rev);
        }),
        format: "margin",
      },
    ];

    const bs = years.map((y) => bsMap.get(y));
    const balanceRows: FiscalMetricRowDef[] = [
      { label: t("annual.totalAssets"), values: bs.map((b) => b?.totalAssets ?? null), format: "currency" },
      { label: t("annual.cash"), values: bs.map((b) => b?.cashAndCashEquivalents ?? null), format: "currency" },
      {
        label: t("annual.accountsReceivable"),
        values: bs.map((b) => b?.accountsReceivable ?? null),
        format: "currency",
      },
      { label: t("annual.inventory"), values: bs.map((b) => b?.inventory ?? null), format: "currency" },
      { label: t("annual.goodwill"), values: bs.map((b) => b?.goodwill ?? null), format: "currency" },
      {
        label: t("annual.currentAssets"),
        values: bs.map((b) => b?.totalCurrentAssets ?? null),
        format: "currency",
      },
      {
        label: t("annual.currentLiabilities"),
        values: bs.map((b) => b?.totalCurrentLiabilities ?? null),
        format: "currency",
      },
      { label: t("annual.totalDebt"), values: bs.map((b) => b?.totalDebt ?? null), format: "currency" },
      { label: t("annual.longTermDebt"), values: bs.map((b) => b?.longTermDebt ?? null), format: "currency" },
      { label: t("annual.netDebt"), values: bs.map((b) => b?.netDebt ?? null), format: "currency" },
      { label: t("annual.equity"), values: bs.map((b) => b?.stockholdersEquity ?? null), format: "currency" },
    ];

    const cfRows: FiscalMetricRowDef[] = [
      {
        label: t("annual.ocf"),
        values: years.map((y) => cfMap.get(y)?.operatingCashFlow ?? null),
        format: "currency",
      },
      {
        label: t("annual.capex"),
        values: years.map((y) => cfMap.get(y)?.capitalExpenditure ?? null),
        format: "currency",
      },
      {
        label: t("annual.fcf"),
        values: years.map((y) => cfMap.get(y)?.freeCashFlow ?? null),
        format: "currency",
      },
      {
        label: t("annual.investingCf"),
        values: years.map((y) => cfMap.get(y)?.investingCashFlow ?? null),
        format: "currency",
      },
      {
        label: t("annual.financingCf"),
        values: years.map((y) => cfMap.get(y)?.financingCashFlow ?? null),
        format: "currency",
      },
      {
        label: t("annual.dividends"),
        values: years.map((y) => cfMap.get(y)?.dividendsPaid ?? null),
        format: "currency",
      },
      {
        label: t("annual.buyback"),
        values: years.map((y) => cfMap.get(y)?.stockRepurchase ?? null),
        format: "currency",
      },
    ];

    const ratioRows: FiscalMetricRowDef[] = [
      {
        label: t("annual.currentRatio"),
        values: bs.map((b) => safeRatio(b?.totalCurrentAssets ?? null, b?.totalCurrentLiabilities ?? null)),
        format: "ratio",
      },
      {
        label: t("annual.debtToEquity"),
        values: bs.map((b) => safeRatio(b?.totalDebt ?? null, b?.stockholdersEquity ?? null)),
        format: "ratio",
      },
      {
        label: t("annual.roe"),
        values: inc.map((r, i) => {
          const eq = bs[i]?.stockholdersEquity;
          return eq != null && eq !== 0 ? safePct(r.netIncome, eq) : null;
        }),
        format: "margin",
      },
      {
        label: t("annual.roa"),
        values: inc.map((r, i) => {
          const ta = bs[i]?.totalAssets;
          return ta != null && ta !== 0 ? safePct(r.netIncome, ta) : null;
        }),
        format: "margin",
      },
    ];

    return { years, perShare, incomeExtra, yoyRows, margins, balanceRows, cfRows, ratioRows };
  }, [data, t]);

  const metricCol = t("income.metricCol");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t("annual.sectionTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("annual.sectionSubtitle")}</p>
      </div>

      <FiscalMetricTable
        title={t("annual.perShareTitle")}
        subtitle={t("annual.perShareSubtitle")}
        metricCol={metricCol}
        years={pack.years}
        rows={pack.perShare}
        yearLabel={formatFy}
      />
      <FiscalMetricTable
        title={t("annual.incomeExtraTitle")}
        subtitle={t("annual.incomeExtraSubtitle")}
        metricCol={metricCol}
        years={pack.years}
        rows={pack.incomeExtra}
        yearLabel={formatFy}
      />
      <FiscalMetricTable
        title={t("annual.yoyTitle")}
        subtitle={t("annual.yoySubtitle")}
        metricCol={metricCol}
        years={pack.years}
        rows={pack.yoyRows}
        yearLabel={formatFy}
      />
      <FiscalMetricTable
        title={t("annual.marginsTitle")}
        subtitle={t("annual.marginsSubtitle")}
        metricCol={metricCol}
        years={pack.years}
        rows={pack.margins}
        yearLabel={formatFy}
      />
      <FiscalMetricTable
        title={t("annual.balanceTitle")}
        subtitle={t("annual.balanceSubtitle")}
        metricCol={metricCol}
        years={pack.years}
        rows={pack.balanceRows}
        yearLabel={formatFy}
      />
      <FiscalMetricTable
        title={t("annual.cashFlowTitle")}
        subtitle={t("annual.cashFlowSubtitle")}
        metricCol={metricCol}
        years={pack.years}
        rows={pack.cfRows}
        yearLabel={formatFy}
      />
      <FiscalMetricTable
        title={t("annual.ratiosTitle")}
        subtitle={t("annual.ratiosSubtitle")}
        metricCol={metricCol}
        years={pack.years}
        rows={pack.ratioRows}
        yearLabel={formatFy}
      />
    </div>
  );
}
