"use client";

import { useCallback, useEffect, useMemo } from "react";

import { FundamentalChartCard, type FundamentalSeries } from "@/components/stock/FundamentalChartCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import {
  buildAnnualChartRows,
  buildQuarterlyChartRows,
  enrichPopGrowth,
  rowsForCharts,
  type FundamentalsChartRow,
} from "@/lib/fundamentalsChartRows";
import { growthPillsEntries, growthPillsForKey, isShareCountGrowthKey } from "@/lib/growthPills";
import { fiscalYearEndMonth, quarterLabel, quarterTitle } from "@/lib/quarterLabels";
import type { ChartTimeRange } from "@/lib/stockAnalysisPeriod";
import {
  filterAnnualRowsByPeriod,
  filterQuarterlyChartRowsByPeriod,
  quarterlyFilterYearBounds,
  useStockAnalysisPeriod,
} from "@/lib/stockAnalysisPeriod";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { sortIncomeByYearAsc, sortQuarterlyByDateAsc } from "@/lib/stockAnalysisTypes";
import { computeValuationByPeriodEnd } from "@/lib/valuationFromHistory";
import { debugLogFundamentalsPipeline } from "@/lib/stockDebugConsole";
import { cn } from "@/lib/utils";

type Row = FundamentalsChartRow;

const C = {
  revenue: "var(--series-blue)",
  netIncome: "var(--series-violet)",
  opIncome: "var(--series-indigo)",
  gross: "var(--series-cyan)",
  opex: "var(--series-red)",
  fcf: "var(--series-amber)",
  ocf: "var(--series-green)",
  capex: "var(--series-orange)",
  invest: "var(--series-purple)",
  finance: "var(--series-pink)",
  assets: "var(--series-blue)",
  debt: "var(--series-red)",
  equity: "var(--series-lime)",
  cash: "var(--series-teal)",
  netDebt: "var(--series-rose)",
  capitalLease: "var(--series-amber)",
  ebitda: "var(--series-fuchsia)",
  div: "var(--series-pink)",
  buyback: "var(--series-slate)",
  revGrowth: "var(--series-leaf)",
  niGrowth: "var(--series-gold)",
  valuationPe: "var(--series-sky)",
  valuationPs: "var(--series-rose)",
};

const BANK_TEXT = {
  en: {
    revenue: "Revenue by source",
    revenueDesc: "Net interest income (lending minus funding cost) plus fees, trading and other income.",
    nii: "Net interest income",
    niiShort: "Net interest income",
    niiDesc: "Interest earned on loans and securities minus interest paid on deposits and debt.",
    nonInterest: "Fees and other income",
    provision: "Provision for credit losses",
    provisionDesc: "Money set aside for loans expected to go bad. Rises when the bank expects trouble.",
    efficiency: "Efficiency ratio",
    efficiencyDesc: "Operating costs as % of revenue. Lower is better; under 60% is good for a large bank.",
    depositsLoans: "Deposits and loans",
    depositsLoansDesc: "Customer deposits fund the bank; loans are where it earns interest.",
    deposits: "Deposits",
    loans: "Loans",
    loanToDeposit: "Loans as % of deposits",
    loanToDepositDesc: "How much of the deposits is lent out. Very high means little cushion, very low means idle money.",
    capital: "Assets and equity",
    capitalDesc: "Size of the balance sheet and the shareholders' capital behind it.",
    equityToAssets: "Equity as % of assets",
    equityToAssetsDesc: "A simple measure of the capital cushion. Regulatory ratios (CET1) are not in the filings data.",
    netMargin: "Net margin",
  },
  bg: {
    revenue: "Приходи по източник",
    revenueDesc: "Нетен лихвен доход (лихви по кредити минус цената на финансирането) плюс такси, търговия и други приходи.",
    nii: "Нетен лихвен доход",
    niiShort: "Нетен лихвен доход",
    niiDesc: "Лихвите, спечелени от кредити и ценни книжа, минус лихвите, платени по депозити и дълг.",
    nonInterest: "Такси и други приходи",
    provision: "Провизии за кредитни загуби",
    provisionDesc: "Пари, заделени за кредити, които се очаква да не бъдат върнати. Растат, когато банката очаква проблеми.",
    efficiency: "Коефициент на ефективност",
    efficiencyDesc: "Оперативните разходи като % от приходите. По-ниско е по-добре; под 60% е добре за голяма банка.",
    depositsLoans: "Депозити и заеми",
    depositsLoansDesc: "Депозитите на клиентите финансират банката; от заемите тя печели лихва.",
    deposits: "Депозити",
    loans: "Заеми",
    loanToDeposit: "Заеми като % от депозитите",
    loanToDepositDesc: "Каква част от депозитите е раздадена като заеми. Много високо значи малък буфер, много ниско значи неизползвани пари.",
    capital: "Активи и собствен капитал",
    capitalDesc: "Размерът на баланса и капиталът на акционерите зад него.",
    equityToAssets: "Собствен капитал като % от активите",
    equityToAssetsDesc: "Прост измерител на капиталовия буфер. Регулаторните коефициенти (CET1) не са в данните от отчетите.",
    netMargin: "Нетен марж",
  },
} as const;

function chartGrowthPills(
  rows: Record<string, unknown>[],
  key: string,
  freq: "annual" | "quarterly",
) {
  return [{ pills: growthPillsForKey(rows, key, freq), invertColors: isShareCountGrowthKey(key) }];
}

function chartGrowthPillsMulti(
  rows: Record<string, unknown>[],
  keys: { key: string; label: string }[],
  freq: "annual" | "quarterly",
) {
  return growthPillsEntries(rows, keys, freq);
}

/** Keep only series that have at least one finite value in the visible rows. */
function seriesWithData(rows: Record<string, unknown>[], series: FundamentalSeries[]): FundamentalSeries[] {
  return series.filter((s) =>
    rows.some((r) => {
      const v = r[s.dataKey];
      return v != null && Number.isFinite(typeof v === "number" ? v : Number(v));
    }),
  );
}

type FundamentalsChartsSectionProps = {
  data: StockAnalysisBundle;
  symbol: string;
};

export function FundamentalsChartsSection({ data, symbol }: FundamentalsChartsSectionProps) {
  const { t, locale } = useI18n();
  const {
    timeRange,
    setTimeRange,
    freq,
    setFreq,
    customFromYear,
    setCustomFromYear,
    customToYear,
    setCustomToYear,
  } = useStockAnalysisPeriod();

  const formatYear = useCallback((fy: string) => t("chart.fyYear", { y: fy }), [t]);

  // Quarters are named ("Q3 '26"), not dated by the month they end: "Sep 26" read as if the
  // numbers were from September although they came out with the report weeks later.
  const fyEndMonth = useMemo(() => fiscalYearEndMonth(data.income.map((r) => r.date)), [data.income]);
  const formatPeriod = useCallback(
    (dateIso: string) => quarterLabel(dateIso, fyEndMonth, locale),
    [fyEndMonth, locale],
  );
  const formatPeriodTitle = useCallback(
    (dateIso: string) => quarterTitle(dateIso, fyEndMonth, locale),
    [fyEndMonth, locale],
  );

  const baseRows = useMemo((): Row[] => {
    return freq === "annual"
      ? buildAnnualChartRows(data, formatYear)
      : buildQuarterlyChartRows(data, formatPeriod, locale, formatPeriodTitle);
  }, [data, freq, formatYear, formatPeriod, formatPeriodTitle, locale]);

  const chartAxisProps = useMemo(
    () =>
      freq === "quarterly"
        ? { xKey: "periodEnd" as const, xLabelFormatter: formatPeriod }
        : {},
    [freq, formatPeriod],
  );

  const annualYearOptions = useMemo(() => {
    const inc = sortIncomeByYearAsc(data.income);
    const ys = new Set<number>();
    for (const r of inc) {
      const y = parseInt(r.fiscalYear, 10);
      if (Number.isFinite(y)) ys.add(y);
    }
    return [...ys].sort((a, b) => a - b);
  }, [data.income]);

  const quarterlyYearOptions = useMemo(() => {
    const q = sortQuarterlyByDateAsc(data.incomeQuarterly);
    const ys = new Set<number>();
    for (const r of q) {
      ys.add(new Date(`${r.date.slice(0, 10)}T12:00:00Z`).getUTCFullYear());
    }
    return [...ys].sort((a, b) => a - b);
  }, [data.incomeQuarterly]);

  const yearOptions = freq === "annual" ? annualYearOptions : quarterlyYearOptions;

  /** Union of calendar years in annual + quarterly data — used for custom range so switching freq does not crush the selection. */
  const mergedYearOptions = useMemo(() => {
    const s = new Set<number>([...annualYearOptions, ...quarterlyYearOptions]);
    return [...s].sort((a, b) => a - b);
  }, [annualYearOptions, quarterlyYearOptions]);

  useEffect(() => {
    if (timeRange !== "custom" || mergedYearOptions.length === 0) return;
    const minY = mergedYearOptions[0];
    const maxY = mergedYearOptions[mergedYearOptions.length - 1];
    setCustomFromYear((prev) => {
      if (prev == null) return minY;
      return Math.max(minY, Math.min(maxY, prev));
    });
    setCustomToYear((prev) => {
      if (prev == null) return maxY;
      return Math.max(minY, Math.min(maxY, prev));
    });
  }, [timeRange, mergedYearOptions, setCustomFromYear, setCustomToYear]);

  const filteredBaseRows = useMemo((): Row[] => {
    if (baseRows.length === 0) return [];
    if (freq === "annual") {
      const incFiltered = filterAnnualRowsByPeriod(
        sortIncomeByYearAsc(data.income),
        timeRange,
        customFromYear,
        customToYear,
      );
      const allowed = new Set(incFiltered.map((r) => r.fiscalYear));
      return baseRows.filter((r) => typeof r.fiscalYear === "string" && allowed.has(r.fiscalYear));
    }
    const bounds = quarterlyFilterYearBounds({
      incomeQuarterly: data.incomeQuarterly,
      dividendQuarterly: data.dividendQuarterly,
    });
    if (!bounds) return [];
    return filterQuarterlyChartRowsByPeriod(baseRows, timeRange, customFromYear, customToYear, bounds);
  }, [baseRows, freq, data.income, data.incomeQuarterly, data.dividendQuarterly, timeRange, customFromYear, customToYear]);

  const rows = useMemo(() => enrichPopGrowth(filteredBaseRows), [filteredBaseRows]);

  const fullRows = useMemo(() => enrichPopGrowth(baseRows), [baseRows]);

  const valuationGranularity = freq === "annual" ? "annual" : "quarterly";
  const valuationByPeriod = useMemo(
    () => computeValuationByPeriodEnd(data, valuationGranularity),
    [data, valuationGranularity],
  );

  const rowsMerged = useMemo(() => {
    return rows.map((r) => {
      const pe = typeof r.periodEnd === "string" ? r.periodEnd.slice(0, 10) : "";
      const base = pe ? valuationByPeriod.get(pe) : undefined;
      return {
        ...r,
        peTtm: base?.peTtm ?? null,
        psTtm: base?.psTtm ?? null,
      };
    });
  }, [rows, valuationByPeriod]);

  /** Full unfiltered series — growth pills need history beyond the visible chart window. */
  const growthPillRows = useMemo(() => {
    return fullRows.map((r) => {
      const pe = typeof r.periodEnd === "string" ? r.periodEnd.slice(0, 10) : "";
      const base = pe ? valuationByPeriod.get(pe) : undefined;
      return {
        ...r,
        peTtm: base?.peTtm ?? null,
        psTtm: base?.psTtm ?? null,
      };
    });
  }, [fullRows, valuationByPeriod]);

  const chartRows = useMemo(
    () => rowsForCharts(rowsMerged, { keepPeriodEnd: freq === "quarterly" }),
    [rowsMerged, freq],
  );

  useEffect(() => {
    const incA = sortIncomeByYearAsc(data.income);
    const incQ = sortQuarterlyByDateAsc(data.incomeQuarterly);
    const qDates = incQ.map((r) => r.date.slice(0, 10));
    const qSample =
      qDates.length <= 6 ? qDates : [...qDates.slice(0, 3), "…", ...qDates.slice(-3)];
    const annualAfter =
      freq === "annual"
        ? filterAnnualRowsByPeriod(incA, timeRange, customFromYear, customToYear)
        : null;

    debugLogFundamentalsPipeline(symbol, {
      freq,
      timeRange,
      customFromYear,
      customToYear,
      rawAnnualIncomeCount: data.income.length,
      rawQuarterlyIncomeCount: data.incomeQuarterly.length,
      annualFiscalYearsInBundle: incA.map((r) => r.fiscalYear),
      quarterlyPeriodEndsSample: qSample,
      annualRowsAfterTimeFilter: annualAfter?.length ?? null,
      annualFiscalYearsAfterTimeFilter: annualAfter?.map((r) => r.fiscalYear) ?? null,
      baseRowsCount: baseRows.length,
      filteredRowsCount: filteredBaseRows.length,
      chartRows: chartRows as Record<string, unknown>[],
      visibleLabels: filteredBaseRows.map((r) => String(r.label ?? "")),
    });
  }, [
    symbol,
    freq,
    timeRange,
    customFromYear,
    customToYear,
    data,
    baseRows,
    filteredBaseRows,
    chartRows,
  ]);

  const hasQuarterly = data.incomeQuarterly.length > 0;
  const hasEbitda = useMemo(
    () => rows.some((r) => r.ebitda != null && Number.isFinite(r.ebitda as number)),
    [rows],
  );
  const hasOperatingIncome = useMemo(
    () =>
      rows.some((r) => r.operatingIncome != null && Number.isFinite(r.operatingIncome as number)),
    [rows],
  );
  const hasEbitdaOcfMargins = useMemo(
    () =>
      rows.some(
        (r) =>
          (r.ebitdaMargin != null && Number.isFinite(r.ebitdaMargin as number)) ||
          (r.ocfMargin != null && Number.isFinite(r.ocfMargin as number)),
      ),
    [rows],
  );
  const hasShareholderFlows = useMemo(
    () =>
      rows.some(
        (r) =>
          (r.dividendsPaid != null && Number.isFinite(r.dividendsPaid as number)) ||
          (r.stockRepurchase != null && Number.isFinite(r.stockRepurchase as number)),
      ),
    [rows],
  );
  const hasDilutedEps = useMemo(
    () => rows.some((r) => r.dilutedEps != null && Number.isFinite(r.dilutedEps as number)),
    [rows],
  );
  const hasDilutedShares = useMemo(
    () => rows.some((r) => r.dilutedShares != null && Number.isFinite(r.dilutedShares as number)),
    [rows],
  );

  const series = useMemo(
    () => ({
      revenue: [{ dataKey: "revenue", color: C.revenue, label: t("income.revenue") }] satisfies FundamentalSeries[],
      netIncomeSolo: [{ dataKey: "netIncome", color: C.netIncome, label: t("income.netIncome") }] satisfies FundamentalSeries[],
      dilutedEpsSolo: [{ dataKey: "dilutedEps", color: "var(--series-pink)", label: t("annual.dilutedEps") }] satisfies FundamentalSeries[],
      dilutedSharesSolo: [
        { dataKey: "dilutedShares", color: "var(--series-slate)", label: t("annual.dilutedShares") },
      ] satisfies FundamentalSeries[],
      operatingIncomeSolo: [
        { dataKey: "operatingIncome", color: C.opIncome, label: t("annual.operatingIncome") },
      ] satisfies FundamentalSeries[],
      opexSolo: [
        { dataKey: "operatingExpenses", color: C.opex, label: t("income.operatingExpenses") },
      ] satisfies FundamentalSeries[],
      margins: [
        { dataKey: "grossMargin", color: C.gross, label: t("annual.grossMargin") },
        { dataKey: "operatingMargin", color: C.opIncome, label: t("annual.operatingMargin") },
        { dataKey: "netMargin", color: C.netIncome, label: t("annual.netMargin") },
      ] satisfies FundamentalSeries[],
      ebitdaSolo: [{ dataKey: "ebitda", color: C.ebitda, label: t("annual.ebitda") }] satisfies FundamentalSeries[],
      peTtm: [{ dataKey: "peTtm", color: C.valuationPe, label: t("chartsFund.seriesPeTtm") }] satisfies FundamentalSeries[],
      psTtm: [{ dataKey: "psTtm", color: C.valuationPs, label: t("chartsFund.seriesPsTtm") }] satisfies FundamentalSeries[],
      ocfSolo: [{ dataKey: "ocf", color: C.ocf, label: t("annual.ocf") }] satisfies FundamentalSeries[],
      fcfSolo: [{ dataKey: "fcf", color: C.fcf, label: t("annual.fcf") }] satisfies FundamentalSeries[],
      capexSolo: [{ dataKey: "capex", color: C.capex, label: t("annual.capex") }] satisfies FundamentalSeries[],
      investFinance: [
        { dataKey: "investCf", color: C.invest, label: t("annual.investingCf") },
        { dataKey: "financeCf", color: C.finance, label: t("annual.financingCf") },
      ] satisfies FundamentalSeries[],
      balance3: [
        { dataKey: "totalAssets", color: C.assets, label: t("annual.totalAssets") },
        { dataKey: "totalDebt", color: C.debt, label: t("annual.totalDebt") },
        { dataKey: "equity", color: C.equity, label: t("annual.equity") },
      ] satisfies FundamentalSeries[],
      cashDebtLease: [
        { dataKey: "cash", color: C.cash, label: t("annual.cash") },
        { dataKey: "totalDebt", color: C.debt, label: t("annual.totalDebt") },
        { dataKey: "capitalLease", color: C.capitalLease, label: t("annual.capitalLease") },
      ] satisfies FundamentalSeries[],
      roeRoa: [
        { dataKey: "roe", color: C.netIncome, label: t("annual.roe") },
        { dataKey: "roa", color: C.ocf, label: t("annual.roa") },
      ] satisfies FundamentalSeries[],
      currentRatio: [{ dataKey: "currentRatio", color: C.cash, label: t("annual.currentRatio") }] satisfies FundamentalSeries[],
      fcfMargin: [{ dataKey: "fcfMargin", color: C.fcf, label: t("annual.fcfMargin") }] satisfies FundamentalSeries[],
      popGrowth: [
        { dataKey: "revPopGrowth", color: C.revGrowth, label: t("chartsFund.seriesRevPop") },
        { dataKey: "niPopGrowth", color: C.niGrowth, label: t("chartsFund.seriesNiPop") },
      ] satisfies FundamentalSeries[],
      shareholder: [
        { dataKey: "dividendsPaidPos", color: C.div, label: t("annual.dividends") },
        { dataKey: "stockRepurchasePos", color: C.buyback, label: t("annual.buyback") },
      ] satisfies FundamentalSeries[],
      ebitdaOcfMargin: [
        { dataKey: "ebitdaMargin", color: C.ebitda, label: t("chartsFund.seriesEbitdaMargin") },
        { dataKey: "ocfMargin", color: C.ocf, label: t("chartsFund.seriesOcfMargin") },
      ] satisfies FundamentalSeries[],
      debtPctCapital: [{ dataKey: "debtPctCapital", color: C.debt, label: t("chartsFund.debtPctCapitalLabel") }] satisfies FundamentalSeries[],
      quickRatio: [{ dataKey: "quickRatio", color: C.ocf, label: t("chartsFund.chartQuickRatio") }] satisfies FundamentalSeries[],
      capexIntensity: [{ dataKey: "capexIntensity", color: C.capex, label: t("chartsFund.seriesCapexIntensity") }] satisfies FundamentalSeries[],
    }),
    [t],
  );

  const empty = chartRows.length === 0;

  // Banks get their own set of charts: gross profit, free cash flow, capex, current ratio
  // and net debt say nothing about a bank, while interest income, deposits, loans and
  // loan-loss provisions say almost everything.
  const isBank = Boolean(data.bank && (data.bank.annual.length > 0 || data.bank.quarterly.length > 0));
  const bankText = BANK_TEXT[locale === "bg" ? "bg" : "en"];
  const bankSeries = useMemo(
    () => ({
      revenueSplit: [
        { dataKey: "netInterestIncome", color: C.revenue, label: bankText.niiShort },
        { dataKey: "nonInterestIncome", color: C.gross, label: bankText.nonInterest },
      ] satisfies FundamentalSeries[],
      nii: [{ dataKey: "netInterestIncome", color: C.revenue, label: bankText.niiShort }] satisfies FundamentalSeries[],
      provision: [{ dataKey: "provisionForCreditLosses", color: C.opex, label: bankText.provision }] satisfies FundamentalSeries[],
      efficiency: [{ dataKey: "efficiencyRatio", color: C.capex, label: bankText.efficiency }] satisfies FundamentalSeries[],
      depositsLoans: [
        { dataKey: "deposits", color: C.cash, label: bankText.deposits },
        { dataKey: "loans", color: C.fcf, label: bankText.loans },
      ] satisfies FundamentalSeries[],
      loanToDeposit: [{ dataKey: "loanToDeposit", color: C.fcf, label: bankText.loanToDeposit }] satisfies FundamentalSeries[],
      capital: [
        { dataKey: "totalAssets", color: C.assets, label: t("annual.totalAssets") },
        { dataKey: "equity", color: C.equity, label: t("annual.equity") },
      ] satisfies FundamentalSeries[],
      equityToAssets: [{ dataKey: "equityToAssets", color: C.equity, label: bankText.equityToAssets }] satisfies FundamentalSeries[],
      netMargin: [{ dataKey: "netMargin", color: C.netIncome, label: bankText.netMargin }] satisfies FundamentalSeries[],
    }),
    [bankText, t],
  );

  const selectClass =
    "h-9 min-w-[8.5rem] rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-emerald-500/50";

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/10">
        <h2 className="text-xl font-semibold tracking-tight">{t("chartsFund.title")}</h2>
      </div>

      <div
        className={cn(
          "sticky top-0 z-20 -mx-4 flex border-b border-border bg-background/90 px-3 py-2 shadow-[0_6px_28px_rgba(0,0,0,0.5)] backdrop-blur-md sm:mx-0 sm:w-fit sm:rounded-lg sm:border sm:border-border",
        )}
      >
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <select
            id="fund-chart-range"
            aria-label={t("chartsFund.filterTimeRange")}
            className={selectClass}
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as ChartTimeRange)}
          >
            <option value="5y">{t("chartsFund.range5y")}</option>
            <option value="3y">{t("chartsFund.range3y")}</option>
            <option value="1y">{t("chartsFund.range1y")}</option>
            <option value="custom">{t("chartsFund.rangeCustom")}</option>
          </select>
          {timeRange === "custom" && mergedYearOptions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fund-from-y" className="text-xs text-muted-foreground">
                  {t("chartsFund.filterFromYear")}
                </Label>
                <select
                  id="fund-from-y"
                  className={selectClass}
                  value={customFromYear ?? mergedYearOptions[0]}
                  onChange={(e) => setCustomFromYear(Number(e.target.value))}
                >
                  {mergedYearOptions.map((y) => (
                    <option key={`f-${y}`} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fund-to-y" className="text-xs text-muted-foreground">
                  {t("chartsFund.filterToYear")}
                </Label>
                <select
                  id="fund-to-y"
                  className={selectClass}
                  value={customToYear ?? mergedYearOptions[mergedYearOptions.length - 1]}
                  onChange={(e) => setCustomToYear(Number(e.target.value))}
                >
                  {mergedYearOptions.map((y) => (
                    <option key={`t-${y}`} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("chartsFund.filterGranularity")}>
            <Button
              type="button"
              size="lg"
              variant={freq === "quarterly" ? "default" : "outline"}
              className={cn(
                "rounded-lg",
                freq === "quarterly" && "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
              onClick={() => setFreq("quarterly")}
              disabled={!hasQuarterly}
              title={!hasQuarterly ? t("chartsFund.quarterlyUnavailable") : undefined}
            >
              {t("chartsFund.quarterly")}
            </Button>
            <Button
              type="button"
              size="lg"
              variant={freq === "annual" ? "default" : "outline"}
              className={cn(
                "rounded-lg",
                freq === "annual" && "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
              onClick={() => setFreq("annual")}
            >
              {t("chartsFund.annual")}
            </Button>
          </div>
        </div>
      </div>

      {empty ? (
        <p className="text-sm text-muted-foreground">{t("chartsFund.noRows")}</p>
      ) : isBank ? (
        <>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FundamentalChartCard
              {...chartAxisProps}
              title={bankText.revenue}
              description={bankText.revenueDesc}
              data={chartRows}
              series={bankSeries.revenueSplit}
              chartType="bar"
              valueFormat="currency"
              growthPills={chartGrowthPills(growthPillRows, "revenue", freq)}
            />
            <FundamentalChartCard
              {...chartAxisProps}
              title={t("chartsFund.chartNetIncomeSolo")}
              data={chartRows}
              series={series.netIncomeSolo}
              chartType="bar"
              valueFormat="currency"
              growthPills={chartGrowthPills(growthPillRows, "netIncome", freq)}
            />
            <FundamentalChartCard
              {...chartAxisProps}
              title={bankText.nii}
              description={bankText.niiDesc}
              data={chartRows}
              series={bankSeries.nii}
              valueFormat="currency"
              growthPills={chartGrowthPills(growthPillRows, "netInterestIncome", freq)}
            />
            {hasDilutedEps ? (
              <FundamentalChartCard
                {...chartAxisProps}
                title={t("chartsFund.chartDilutedEps")}
                data={chartRows}
                series={series.dilutedEpsSolo}
                valueFormat="perShare"
                growthPills={chartGrowthPills(growthPillRows, "dilutedEps", freq)}
              />
            ) : null}
            <FundamentalChartCard
              {...chartAxisProps}
              title={bankText.provision}
              description={bankText.provisionDesc}
              data={chartRows}
              series={bankSeries.provision}
              chartType="bar"
              valueFormat="currency"
            />
            <FundamentalChartCard
              {...chartAxisProps}
              title={bankText.efficiency}
              description={bankText.efficiencyDesc}
              data={chartRows}
              series={bankSeries.efficiency}
              chartType="line"
              valueFormat="percent"
            />
            <FundamentalChartCard
              {...chartAxisProps}
              title={bankText.depositsLoans}
              description={bankText.depositsLoansDesc}
              data={chartRows}
              series={bankSeries.depositsLoans}
              valueFormat="currency"
              growthPills={chartGrowthPillsMulti(
                growthPillRows,
                [
                  { key: "deposits", label: bankText.deposits },
                  { key: "loans", label: bankText.loans },
                ],
                freq,
              )}
            />
            <FundamentalChartCard
              {...chartAxisProps}
              title={bankText.loanToDeposit}
              description={bankText.loanToDepositDesc}
              data={chartRows}
              series={bankSeries.loanToDeposit}
              chartType="line"
              valueFormat="percent"
            />
            <FundamentalChartCard
              {...chartAxisProps}
              title={t("chartsFund.chartRoeRoa")}
              description={t("chartsFund.chartRoeRoaDesc")}
              data={chartRows}
              series={series.roeRoa}
              valueFormat="percent"
            />
            <FundamentalChartCard
              {...chartAxisProps}
              title={bankText.capital}
              description={bankText.capitalDesc}
              data={chartRows}
              series={bankSeries.capital}
              valueFormat="currency"
            />
            <FundamentalChartCard
              {...chartAxisProps}
              title={bankText.equityToAssets}
              description={bankText.equityToAssetsDesc}
              data={chartRows}
              series={bankSeries.equityToAssets}
              chartType="line"
              valueFormat="percent"
            />
            <FundamentalChartCard
              {...chartAxisProps}
              title={bankText.netMargin}
              data={chartRows}
              series={bankSeries.netMargin}
              chartType="line"
              valueFormat="percent"
            />
            <FundamentalChartCard
              {...chartAxisProps}
              title={t("chartsFund.chartPeTtm")}
              data={chartRows}
              series={series.peTtm}
              valueFormat="ratio"
              growthPills={chartGrowthPills(growthPillRows, "peTtm", freq)}
            />
            {hasDilutedShares ? (
              <FundamentalChartCard
                {...chartAxisProps}
                title={t("chartsFund.chartDilutedShares")}
                data={chartRows}
                series={series.dilutedSharesSolo}
                valueFormat="compactCount"
                growthPills={chartGrowthPills(growthPillRows, "dilutedShares", freq)}
              />
            ) : null}
            {hasShareholderFlows ? (
              <FundamentalChartCard
                {...chartAxisProps}
                title={t("chartsFund.chartShareholder")}
                data={chartRows}
                series={series.shareholder}
                valueFormat="currency"
                growthPills={chartGrowthPillsMulti(
                  growthPillRows,
                  [
                    { key: "dividendsPaidPos", label: t("annual.dividends") },
                    { key: "stockRepurchasePos", label: t("annual.buyback") },
                  ],
                  freq,
                )}
              />
            ) : null}
          </div>
        </>
      ) : (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartRevenue")}
            data={chartRows}
            series={series.revenue}
            valueFormat="currency"
            growthPills={chartGrowthPills(growthPillRows, "revenue", freq)}
          />
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartNetIncomeSolo")}
            data={chartRows}
            series={series.netIncomeSolo}
            chartType="bar"
            valueFormat="currency"
            growthPills={chartGrowthPills(growthPillRows, "netIncome", freq)}
          />
          {hasDilutedEps ? (
            <FundamentalChartCard
            {...chartAxisProps}
              title={t("chartsFund.chartDilutedEps")}
              data={chartRows}
              series={series.dilutedEpsSolo}
              valueFormat="perShare"
              growthPills={chartGrowthPills(growthPillRows, "dilutedEps", freq)}
            />
          ) : null}
          {hasDilutedShares ? (
            <FundamentalChartCard
            {...chartAxisProps}
              title={t("chartsFund.chartDilutedShares")}
              data={chartRows}
              series={series.dilutedSharesSolo}
              valueFormat="compactCount"
              growthPills={chartGrowthPills(growthPillRows, "dilutedShares", freq)}
            />
          ) : null}
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartPeTtm")}
            data={chartRows}
            series={series.peTtm}
            valueFormat="ratio"
            growthPills={chartGrowthPills(growthPillRows, "peTtm", freq)}
          />
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartPsTtm")}
            data={chartRows}
            series={series.psTtm}
            valueFormat="ratio"
            growthPills={chartGrowthPills(growthPillRows, "psTtm", freq)}
          />
          {hasOperatingIncome ? (
            <FundamentalChartCard
            {...chartAxisProps}
              title={t("chartsFund.chartOperatingIncomeSolo")}
              data={chartRows}
              series={series.operatingIncomeSolo}
              valueFormat="currency"
              growthPills={chartGrowthPills(growthPillRows, "operatingIncome", freq)}
            />
          ) : null}
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartOpexSolo")}
            data={chartRows}
            series={series.opexSolo}
            valueFormat="currency"
            growthPills={chartGrowthPills(growthPillRows, "operatingExpenses", freq)}
          />
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartMargins")}
            description={t("chartsFund.chartMarginsDesc")}
            data={chartRows}
            series={series.margins}
            valueFormat="percent"
            growthPills={chartGrowthPillsMulti(
              growthPillRows,
              [
                { key: "grossMargin", label: t("annual.grossMargin") },
                { key: "operatingMargin", label: t("annual.operatingMargin") },
                { key: "netMargin", label: t("annual.netMargin") },
              ],
              freq,
            )}
          />
          {hasEbitda ? (
            <FundamentalChartCard
            {...chartAxisProps}
              title={t("chartsFund.chartEbitdaSolo")}
              description={t("chartsFund.chartEbitdaSoloDesc")}
              data={chartRows}
              series={series.ebitdaSolo}
              valueFormat="currency"
              growthPills={chartGrowthPills(growthPillRows, "ebitda", freq)}
            />
          ) : null}
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartOcfSolo")}
            data={chartRows}
            series={series.ocfSolo}
            valueFormat="currency"
            growthPills={chartGrowthPills(growthPillRows, "ocf", freq)}
          />
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartFcfSolo")}
            data={chartRows}
            series={series.fcfSolo}
            valueFormat="currency"
            growthPills={chartGrowthPills(growthPillRows, "fcf", freq)}
          />
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartCapexSolo")}
            data={chartRows}
            series={series.capexSolo}
            valueFormat="currency"
            growthPills={chartGrowthPills(growthPillRows, "capex", freq)}
          />
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartInvestFinance")}
            data={chartRows}
            series={series.investFinance}
            valueFormat="currency"
            growthPills={chartGrowthPillsMulti(
              growthPillRows,
              [
                { key: "investCf", label: t("annual.investingCf") },
                { key: "financeCf", label: t("annual.financingCf") },
              ],
              freq,
            )}
          />
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartBalance")}
            data={chartRows}
            series={seriesWithData(chartRows, series.balance3)}
            chartType="bar"
            valueFormat="currency"
            growthPills={chartGrowthPillsMulti(
              growthPillRows,
              [
                { key: "totalAssets", label: t("annual.totalAssets") },
                { key: "totalDebt", label: t("annual.totalDebt") },
                { key: "equity", label: t("annual.equity") },
              ],
              freq,
            )}
          />
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartCashNetDebt")}
            data={chartRows}
            series={seriesWithData(chartRows, series.cashDebtLease)}
            chartType="bar"
            valueFormat="currency"
            growthPills={chartGrowthPillsMulti(
              growthPillRows,
              seriesWithData(growthPillRows, series.cashDebtLease).map((s) => ({
                key: s.dataKey,
                label: s.label,
              })),
              freq,
            )}
          />
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartRoeRoa")}
            description={t("chartsFund.chartRoeRoaDesc")}
            data={chartRows}
            series={series.roeRoa}
            valueFormat="percent"
            growthPills={chartGrowthPillsMulti(
              growthPillRows,
              [
                { key: "roe", label: t("annual.roe") },
                { key: "roa", label: t("annual.roa") },
              ],
              freq,
            )}
          />
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartCurrentRatio")}
            description={t("chartsFund.chartCurrentRatioDesc")}
            data={chartRows}
            series={series.currentRatio}
            valueFormat="ratio"
            growthPills={chartGrowthPills(growthPillRows, "currentRatio", freq)}
          />
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartFcfMargin")}
            data={chartRows}
            series={series.fcfMargin}
            valueFormat="percent"
            growthPills={chartGrowthPills(growthPillRows, "fcfMargin", freq)}
          />
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartPopGrowth")}
            description={freq === "annual" ? t("chartsFund.chartPopGrowthDescAnnual") : t("chartsFund.chartPopGrowthDescQ")}
            data={chartRows}
            series={series.popGrowth}
            valueFormat="percent"
            growthPills={chartGrowthPillsMulti(
              growthPillRows,
              [
                { key: "revPopGrowth", label: t("chartsFund.seriesRevPop") },
                { key: "niPopGrowth", label: t("chartsFund.seriesNiPop") },
              ],
              freq,
            )}
          />
          {hasShareholderFlows ? (
            <FundamentalChartCard
            {...chartAxisProps}
              title={t("chartsFund.chartShareholder")}
              data={chartRows}
              series={series.shareholder}
              valueFormat="currency"
              growthPills={chartGrowthPillsMulti(
                growthPillRows,
                [
                  { key: "dividendsPaidPos", label: t("annual.dividends") },
                  { key: "stockRepurchasePos", label: t("annual.buyback") },
                ],
                freq,
              )}
            />
          ) : null}
          {hasEbitdaOcfMargins ? (
            <FundamentalChartCard
            {...chartAxisProps}
              title={t("chartsFund.chartEbitdaOcfMargin")}
              description={t("chartsFund.chartEbitdaOcfMarginDesc")}
              data={chartRows}
              series={series.ebitdaOcfMargin}
              valueFormat="percent"
              growthPills={chartGrowthPillsMulti(
                growthPillRows,
                [
                  { key: "ebitdaMargin", label: t("chartsFund.seriesEbitdaMargin") },
                  { key: "ocfMargin", label: t("chartsFund.seriesOcfMargin") },
                ],
                freq,
              )}
            />
          ) : null}
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartDebtPctCapital")}
            data={chartRows}
            series={series.debtPctCapital}
            valueFormat="percent"
            growthPills={chartGrowthPills(growthPillRows, "debtPctCapital", freq)}
          />
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartQuickRatio")}
            description={t("chartsFund.chartQuickRatioDesc")}
            data={chartRows}
            series={series.quickRatio}
            valueFormat="ratio"
            growthPills={chartGrowthPills(growthPillRows, "quickRatio", freq)}
          />
          <FundamentalChartCard
            {...chartAxisProps}
            title={t("chartsFund.chartCapexIntensity")}
            data={chartRows}
            series={series.capexIntensity}
            valueFormat="percent"
            growthPills={chartGrowthPills(growthPillRows, "capexIntensity", freq)}
          />
        </div>
      )}
    </div>
  );
}
