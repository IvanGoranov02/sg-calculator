"use client";

import { useCallback, useMemo } from "react";

import { FiscalMetricTable, type FiscalMetricRowDef } from "@/components/stock/FiscalMetricTable";
import { safePct, safeRatio, yoyPercentNullableSeries } from "@/lib/annualTables";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { annualDisplayFiscalYears, useStockAnalysisPeriod } from "@/lib/stockAnalysisPeriod";
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
  const { timeRange, customFromYear, customToYear } = useStockAnalysisPeriod();
  const formatFy = useCallback((y: string) => t("chart.fyYear", { y }), [t]);

  const pack = useMemo(() => {
    const years = annualDisplayFiscalYears(data, timeRange, customFromYear, customToYear);
    const incSorted = sortIncomeByYearAsc(data.income);
    const incMap = new Map(incSorted.map((r) => [r.fiscalYear, r]));
    const cfMap = byFy(data.cashFlow);
    const bsMap = byFy(data.balanceSheet);

    const perShare: FiscalMetricRowDef[] = [
      {
        label: t("annual.dilutedEps"),
        values: years.map((y) => incMap.get(y)?.dilutedEps ?? null),
        format: "eps",
      },
      {
        label: t("annual.dilutedShares"),
        values: years.map((y) => incMap.get(y)?.dilutedAverageShares ?? null),
        format: "shares",
      },
    ];

    const incomeExtra: FiscalMetricRowDef[] = [
      {
        label: t("annual.operatingIncome"),
        values: years.map((y) => incMap.get(y)?.operatingIncome ?? null),
        format: "currency",
      },
      {
        label: t("annual.ebitda"),
        values: years.map((y) => incMap.get(y)?.ebitda ?? null),
        format: "currency",
      },
    ];

    const revenues = years.map((y) => {
      const r = incMap.get(y);
      return r != null ? r.revenue : null;
    });
    const netIncomes = years.map((y) => {
      const r = incMap.get(y);
      return r != null ? r.netIncome : null;
    });
    const gps = years.map((y) => {
      const r = incMap.get(y);
      return r != null ? r.grossProfit : null;
    });
    const fcfSeries = years.map((y) => {
      const c = cfMap.get(y);
      return c ? c.freeCashFlow : null;
    });

    const yoyRows: FiscalMetricRowDef[] = [
      { label: t("annual.revYoy"), values: yoyPercentNullableSeries(revenues), format: "yoy" },
      { label: t("annual.niYoy"), values: yoyPercentNullableSeries(netIncomes), format: "yoy" },
      { label: t("annual.gpYoy"), values: yoyPercentNullableSeries(gps), format: "yoy" },
      { label: t("annual.fcfYoy"), values: yoyPercentNullableSeries(fcfSeries), format: "yoy" },
    ];

    const margins: FiscalMetricRowDef[] = [
      {
        label: t("annual.grossMargin"),
        values: years.map((y) => {
          const r = incMap.get(y);
          if (!r) return null;
          return safePct(r.grossProfit, r.revenue);
        }),
        format: "margin",
      },
      {
        label: t("annual.operatingMargin"),
        values: years.map((y) => {
          const r = incMap.get(y);
          if (!r || r.operatingIncome == null) return null;
          return safePct(r.operatingIncome, r.revenue);
        }),
        format: "margin",
      },
      {
        label: t("annual.netMargin"),
        values: years.map((y) => {
          const r = incMap.get(y);
          if (!r) return null;
          return safePct(r.netIncome, r.revenue);
        }),
        format: "margin",
      },
      {
        label: t("annual.fcfMargin"),
        values: years.map((y) => {
          const c = cfMap.get(y);
          const r = incMap.get(y);
          if (c == null || r == null || r.revenue === 0) return null;
          return safePct(c.freeCashFlow, r.revenue);
        }),
        format: "margin",
      },
    ];

    const balanceRows: FiscalMetricRowDef[] = [
      { label: t("annual.totalAssets"), values: years.map((y) => bsMap.get(y)?.totalAssets ?? null), format: "currency" },
      { label: t("annual.cash"), values: years.map((y) => bsMap.get(y)?.cashAndCashEquivalents ?? null), format: "currency" },
      {
        label: t("annual.accountsReceivable"),
        values: years.map((y) => bsMap.get(y)?.accountsReceivable ?? null),
        format: "currency",
      },
      { label: t("annual.inventory"), values: years.map((y) => bsMap.get(y)?.inventory ?? null), format: "currency" },
      { label: t("annual.goodwill"), values: years.map((y) => bsMap.get(y)?.goodwill ?? null), format: "currency" },
      {
        label: t("annual.currentAssets"),
        values: years.map((y) => bsMap.get(y)?.totalCurrentAssets ?? null),
        format: "currency",
      },
      {
        label: t("annual.currentLiabilities"),
        values: years.map((y) => bsMap.get(y)?.totalCurrentLiabilities ?? null),
        format: "currency",
      },
      { label: t("annual.totalDebt"), values: years.map((y) => bsMap.get(y)?.totalDebt ?? null), format: "currency" },
      { label: t("annual.longTermDebt"), values: years.map((y) => bsMap.get(y)?.longTermDebt ?? null), format: "currency" },
      { label: t("annual.netDebt"), values: years.map((y) => bsMap.get(y)?.netDebt ?? null), format: "currency" },
      { label: t("annual.equity"), values: years.map((y) => bsMap.get(y)?.stockholdersEquity ?? null), format: "currency" },
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
        values: years.map((y) => {
          const b = bsMap.get(y);
          return safeRatio(b?.totalCurrentAssets ?? null, b?.totalCurrentLiabilities ?? null);
        }),
        format: "ratio",
      },
      {
        label: t("annual.debtToEquity"),
        values: years.map((y) => {
          const b = bsMap.get(y);
          return safeRatio(b?.totalDebt ?? null, b?.stockholdersEquity ?? null);
        }),
        format: "ratio",
      },
      {
        label: t("annual.roe"),
        values: years.map((y) => {
          const r = incMap.get(y);
          const b = bsMap.get(y);
          const eq = b?.stockholdersEquity;
          if (!r || eq == null || eq === 0) return null;
          return safePct(r.netIncome, eq);
        }),
        format: "margin",
      },
      {
        label: t("annual.roa"),
        values: years.map((y) => {
          const r = incMap.get(y);
          const b = bsMap.get(y);
          const ta = b?.totalAssets;
          if (!r || ta == null || ta === 0) return null;
          return safePct(r.netIncome, ta);
        }),
        format: "margin",
      },
    ];

    return { years, perShare, incomeExtra, yoyRows, margins, balanceRows, cfRows, ratioRows };
  }, [data, t, timeRange, customFromYear, customToYear]);

  const metricCol = t("income.metricCol");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t("annual.sectionTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("annual.sectionSubtitle")}</p>
        <p className="mt-2 text-xs text-muted-foreground/90">{t("chartsFund.periodFilterTablesHint")}</p>
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
