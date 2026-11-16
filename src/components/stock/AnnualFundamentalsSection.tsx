"use client";

import { useCallback, useMemo } from "react";

import { FiscalMetricTable, type FiscalMetricRowDef } from "@/components/stock/FiscalMetricTable";
import { yoyPercentNullableSeries } from "@/lib/annualTables";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { annualDisplayFiscalYears, useStockAnalysisPeriod } from "@/lib/stockAnalysisPeriod";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { sortIncomeByYearAsc } from "@/lib/stockAnalysisTypes";

type AnnualFundamentalsSectionProps = {
  data: StockAnalysisBundle;
};

const BANK_TABLE_TEXT = {
  en: {
    title: "Bank figures",
    subtitle: "What a bank earns, what it sets aside for bad loans, and what funds it.",
    nii: "Net interest income",
    nonInterest: "Fees and other income",
    costs: "Operating costs",
    provision: "Provision for credit losses",
    deposits: "Deposits",
    loans: "Loans",
    efficiency: "Efficiency ratio (costs / revenue)",
    loanToDeposit: "Loans / deposits",
  },
  bg: {
    title: "Банкови показатели",
    subtitle: "Какво печели банката, колко заделя за лоши кредити и с какво се финансира.",
    nii: "Нетен лихвен доход",
    nonInterest: "Такси и други приходи",
    costs: "Оперативни разходи",
    provision: "Провизии за кредитни загуби",
    deposits: "Депозити",
    loans: "Заеми",
    efficiency: "Коефициент на ефективност (разходи / приходи)",
    loanToDeposit: "Заеми / депозити",
  },
} as const;

function byFy<T extends { fiscalYear: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.fiscalYear, r]));
}

export function AnnualFundamentalsSection({ data }: AnnualFundamentalsSectionProps) {
  const { t, locale } = useI18n();
  const bankText = BANK_TABLE_TEXT[locale === "bg" ? "bg" : "en"];
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

    const bankMap = new Map((data.bank?.annual ?? []).map((b) => [b.fiscalYear ?? b.date.slice(0, 4), b]));
    const pct = (a: number | null | undefined, b: number | null | undefined) =>
      a != null && b != null && b > 0 ? (a / b) * 100 : null;
    const bankRows: FiscalMetricRowDef[] =
      bankMap.size === 0
        ? []
        : [
            { label: bankText.nii, values: years.map((y) => bankMap.get(y)?.netInterestIncome ?? null), format: "currency" },
            { label: bankText.nonInterest, values: years.map((y) => bankMap.get(y)?.nonInterestIncome ?? null), format: "currency" },
            { label: bankText.costs, values: years.map((y) => bankMap.get(y)?.nonInterestExpense ?? null), format: "currency" },
            { label: bankText.provision, values: years.map((y) => bankMap.get(y)?.provisionForCreditLosses ?? null), format: "currency" },
            { label: bankText.deposits, values: years.map((y) => bankMap.get(y)?.deposits ?? null), format: "currency" },
            { label: bankText.loans, values: years.map((y) => bankMap.get(y)?.loans ?? null), format: "currency" },
            {
              label: bankText.efficiency,
              values: years.map((y) => pct(bankMap.get(y)?.nonInterestExpense, incMap.get(y)?.revenue)),
              format: "margin",
            },
            {
              label: bankText.loanToDeposit,
              values: years.map((y) => pct(bankMap.get(y)?.loans, bankMap.get(y)?.deposits)),
              format: "margin",
            },
          ];

    return { years, perShare, incomeExtra, yoyRows, balanceRows, bankRows };
  }, [data, t, bankText, timeRange, customFromYear, customToYear]);

  const metricCol = t("income.metricCol");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t("annual.sectionTitle")}</h2>
      </div>

      {pack.bankRows.length > 0 ? (
        <FiscalMetricTable
          title={bankText.title}
          subtitle={bankText.subtitle}
          metricCol={metricCol}
          years={pack.years}
          rows={pack.bankRows}
          yearLabel={formatFy}
        />
      ) : null}
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
        title={t("annual.balanceTitle")}
        subtitle={t("annual.balanceSubtitle")}
        metricCol={metricCol}
        years={pack.years}
        rows={pack.balanceRows}
        yearLabel={formatFy}
      />
    </div>
  );
}
