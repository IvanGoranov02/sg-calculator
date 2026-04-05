"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

import { FundamentalChartCard, type FundamentalSeries } from "@/components/stock/FundamentalChartCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { safePct, safeRatio } from "@/lib/annualTables";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { sortIncomeByYearAsc, sortQuarterlyByDateAsc } from "@/lib/stockAnalysisTypes";
import { cn } from "@/lib/utils";

type Freq = "annual" | "quarterly";

/** ISO date (period end) for filtering; stripped before passing to Recharts. */
type Row = Record<string, unknown> & { periodEnd?: string };

type ChartTimeRange = "all" | "10y" | "5y" | "3y" | "1y" | "custom";

function filterByCalendarYears(rows: Row[], years: number): Row[] {
  if (rows.length === 0) return rows;
  const cutoff = new Date();
  cutoff.setUTCHours(12, 0, 0, 0);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const out = rows.filter((r) => {
    const pe = r.periodEnd;
    if (!pe || typeof pe !== "string") return true;
    return pe >= cutoffStr;
  });
  return out.length > 0 ? out : rows;
}

function filterByFiscalYearRange(rows: Row[], fromYear: number, toYear: number): Row[] {
  const lo = Math.min(fromYear, toYear);
  const hi = Math.max(fromYear, toYear);
  const out = rows.filter((r) => {
    const pe = r.periodEnd;
    if (!pe || typeof pe !== "string") return true;
    const y = new Date(`${pe}T12:00:00Z`).getFullYear();
    return y >= lo && y <= hi;
  });
  return out.length > 0 ? out : rows;
}

function yearOptionsFromRows(rows: Row[]): number[] {
  const ys = new Set<number>();
  for (const r of rows) {
    const pe = r.periodEnd;
    if (!pe || typeof pe !== "string") continue;
    ys.add(new Date(`${pe}T12:00:00Z`).getFullYear());
  }
  return [...ys].sort((a, b) => a - b);
}

function rowsForCharts(rows: Row[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const { periodEnd: _p, ...rest } = r;
    return rest;
  });
}

const C = {
  revenue: "#60a5fa",
  netIncome: "#a78bfa",
  opIncome: "#818cf8",
  gross: "#22d3ee",
  opex: "#f87171",
  fcf: "#fbbf24",
  ocf: "#34d399",
  capex: "#fb923c",
  invest: "#c084fc",
  finance: "#f472b6",
  assets: "#60a5fa",
  debt: "#f87171",
  equity: "#4ade80",
  cash: "#2dd4bf",
  netDebt: "#fb7185",
  ebitda: "#e879f9",
  div: "#f472b6",
  buyback: "#94a3b8",
  ar: "#38bdf8",
  inv: "#f59e0b",
  gw: "#a78bfa",
  ltDebt: "#f97316",
  revGrowth: "#22c55e",
  niGrowth: "#eab308",
};

function buildAnnualRows(bundle: StockAnalysisBundle, formatYear: (fy: string) => string): Row[] {
  const inc = sortIncomeByYearAsc(bundle.income);
  const cfMap = new Map(bundle.cashFlow.map((c) => [c.fiscalYear, c]));
  const bsMap = new Map(bundle.balanceSheet.map((b) => [b.fiscalYear, b]));
  return inc.map((r) => {
    const cf = cfMap.get(r.fiscalYear);
    const bs = bsMap.get(r.fiscalYear);
    const rev = r.revenue;
    const ebitda = r.ebitda ?? null;
    return {
      label: formatYear(r.fiscalYear),
      periodEnd: r.date.slice(0, 10),
      revenue: r.revenue,
      netIncome: r.netIncome,
      operatingIncome: r.operatingIncome ?? null,
      grossProfit: r.grossProfit,
      operatingExpenses: r.operatingExpenses,
      ebitda,
      grossMargin: safePct(r.grossProfit, rev),
      operatingMargin: r.operatingIncome != null ? safePct(r.operatingIncome, rev) : null,
      netMargin: safePct(r.netIncome, rev),
      ebitdaMargin: ebitda != null && rev !== 0 ? safePct(ebitda, rev) : null,
      ocfMargin:
        cf?.operatingCashFlow != null && rev !== 0 ? safePct(cf.operatingCashFlow, rev) : null,
      ocf: cf?.operatingCashFlow ?? null,
      fcf: cf?.freeCashFlow ?? null,
      capex: cf?.capitalExpenditure ?? null,
      investCf: cf?.investingCashFlow ?? null,
      financeCf: cf?.financingCashFlow ?? null,
      dividendsPaid: cf?.dividendsPaid ?? null,
      stockRepurchase: cf?.stockRepurchase ?? null,
      dividendsPaidPos: cf?.dividendsPaid != null ? Math.abs(cf.dividendsPaid) : null,
      stockRepurchasePos: cf?.stockRepurchase != null ? Math.abs(cf.stockRepurchase) : null,
      totalAssets: bs?.totalAssets ?? null,
      totalDebt: bs?.totalDebt ?? null,
      equity: bs?.stockholdersEquity ?? null,
      cash: bs?.cashAndCashEquivalents ?? null,
      netDebt: bs?.netDebt ?? null,
      ar: bs?.accountsReceivable ?? null,
      inventory: bs?.inventory ?? null,
      goodwill: bs?.goodwill ?? null,
      longTermDebt: bs?.longTermDebt ?? null,
      currentRatio: safeRatio(bs?.totalCurrentAssets ?? null, bs?.totalCurrentLiabilities ?? null),
      quickRatio: safeRatio(
        bs?.totalCurrentAssets != null && bs?.inventory != null
          ? bs.totalCurrentAssets - bs.inventory
          : null,
        bs?.totalCurrentLiabilities ?? null,
      ),
      debtToEquity: safeRatio(bs?.totalDebt ?? null, bs?.stockholdersEquity ?? null),
      debtPctCapital:
        bs?.totalDebt != null && bs?.stockholdersEquity != null
          ? (() => {
              const td = bs.totalDebt;
              const eq = bs.stockholdersEquity;
              const cap = td + eq;
              return cap !== 0 && Number.isFinite(cap) ? safePct(td, cap) : null;
            })()
          : null,
      netDebtToEbitda:
        ebitda != null && bs?.netDebt != null && ebitda > 0
          ? safeRatio(bs.netDebt, ebitda)
          : null,
      capexIntensity:
        cf?.capitalExpenditure != null && rev !== 0
          ? safePct(Math.abs(cf.capitalExpenditure), rev)
          : null,
      roe:
        bs?.stockholdersEquity != null && bs.stockholdersEquity !== 0
          ? safePct(r.netIncome, bs.stockholdersEquity)
          : null,
      roa: bs?.totalAssets != null && bs.totalAssets !== 0 ? safePct(r.netIncome, bs.totalAssets) : null,
      fcfMargin:
        cf != null && rev !== 0 ? safePct(cf.freeCashFlow, rev) : null,
      dilutedEps: r.dilutedEps ?? null,
      dilutedShares: r.dilutedAverageShares ?? null,
    };
  });
}

function buildQuarterlyRows(
  bundle: StockAnalysisBundle,
  formatPeriod: (dateIso: string) => string,
): Row[] {
  const inc = sortQuarterlyByDateAsc(bundle.incomeQuarterly);
  const cfByDate = new Map(bundle.cashFlowQuarterly.map((c) => [c.date, c]));
  const bsByDate = new Map(bundle.balanceSheetQuarterly.map((b) => [b.date, b]));
  return inc.map((r) => {
    const cf = cfByDate.get(r.date);
    const bs = bsByDate.get(r.date);
    const rev = r.revenue;
    const ebitda = r.ebitda ?? null;
    return {
      label: formatPeriod(r.date),
      periodEnd: r.date.slice(0, 10),
      revenue: r.revenue,
      netIncome: r.netIncome,
      operatingIncome: r.operatingIncome ?? null,
      grossProfit: r.grossProfit,
      operatingExpenses: r.operatingExpenses,
      ebitda,
      grossMargin: safePct(r.grossProfit, rev),
      operatingMargin: r.operatingIncome != null ? safePct(r.operatingIncome, rev) : null,
      netMargin: safePct(r.netIncome, rev),
      ebitdaMargin: ebitda != null && rev !== 0 ? safePct(ebitda, rev) : null,
      ocfMargin:
        cf?.operatingCashFlow != null && rev !== 0 ? safePct(cf.operatingCashFlow, rev) : null,
      ocf: cf?.operatingCashFlow ?? null,
      fcf: cf?.freeCashFlow ?? null,
      capex: cf?.capitalExpenditure ?? null,
      investCf: cf?.investingCashFlow ?? null,
      financeCf: cf?.financingCashFlow ?? null,
      dividendsPaid: cf?.dividendsPaid ?? null,
      stockRepurchase: cf?.stockRepurchase ?? null,
      dividendsPaidPos: cf?.dividendsPaid != null ? Math.abs(cf.dividendsPaid) : null,
      stockRepurchasePos: cf?.stockRepurchase != null ? Math.abs(cf.stockRepurchase) : null,
      totalAssets: bs?.totalAssets ?? null,
      totalDebt: bs?.totalDebt ?? null,
      equity: bs?.stockholdersEquity ?? null,
      cash: bs?.cashAndCashEquivalents ?? null,
      netDebt: bs?.netDebt ?? null,
      ar: bs?.accountsReceivable ?? null,
      inventory: bs?.inventory ?? null,
      goodwill: bs?.goodwill ?? null,
      longTermDebt: bs?.longTermDebt ?? null,
      currentRatio: safeRatio(bs?.totalCurrentAssets ?? null, bs?.totalCurrentLiabilities ?? null),
      quickRatio: safeRatio(
        bs?.totalCurrentAssets != null && bs?.inventory != null
          ? bs.totalCurrentAssets - bs.inventory
          : null,
        bs?.totalCurrentLiabilities ?? null,
      ),
      debtToEquity: safeRatio(bs?.totalDebt ?? null, bs?.stockholdersEquity ?? null),
      debtPctCapital:
        bs?.totalDebt != null && bs?.stockholdersEquity != null
          ? (() => {
              const td = bs.totalDebt;
              const eq = bs.stockholdersEquity;
              const cap = td + eq;
              return cap !== 0 && Number.isFinite(cap) ? safePct(td, cap) : null;
            })()
          : null,
      netDebtToEbitda:
        ebitda != null && bs?.netDebt != null && ebitda > 0
          ? safeRatio(bs.netDebt, ebitda)
          : null,
      capexIntensity:
        cf?.capitalExpenditure != null && rev !== 0
          ? safePct(Math.abs(cf.capitalExpenditure), rev)
          : null,
      roe:
        bs?.stockholdersEquity != null && bs.stockholdersEquity !== 0
          ? safePct(r.netIncome, bs.stockholdersEquity)
          : null,
      roa: bs?.totalAssets != null && bs.totalAssets !== 0 ? safePct(r.netIncome, bs.totalAssets) : null,
      fcfMargin:
        cf != null && rev !== 0 ? safePct(cf.freeCashFlow, rev) : null,
      dilutedEps: r.dilutedEps ?? null,
      dilutedShares: r.dilutedAverageShares ?? null,
    };
  });
}

function enrichPopGrowth(rows: Row[]): Row[] {
  return rows.map((row, i) => {
    const base = { ...row };
    if (i === 0) {
      base.revPopGrowth = null;
      base.niPopGrowth = null;
      return base;
    }
    const prev = rows[i - 1];
    const rev = Number(base.revenue);
    const prevRev = Number(prev.revenue);
    const ni = Number(base.netIncome);
    const prevNi = Number(prev.netIncome);
    base.revPopGrowth =
      Number.isFinite(rev) && Number.isFinite(prevRev) && prevRev !== 0
        ? ((rev - prevRev) / prevRev) * 100
        : null;
    base.niPopGrowth =
      Number.isFinite(ni) && Number.isFinite(prevNi) && prevNi !== 0
        ? ((ni - prevNi) / prevNi) * 100
        : null;
    return base;
  });
}

type FundamentalsChartsSectionProps = {
  data: StockAnalysisBundle;
  symbol: string;
  onBundleReplace?: (bundle: StockAnalysisBundle) => void;
};

export function FundamentalsChartsSection({ data, symbol, onBundleReplace }: FundamentalsChartsSectionProps) {
  const { t, locale } = useI18n();
  const [geminiBusy, setGeminiBusy] = useState(false);
  const [geminiFillHint, setGeminiFillHint] = useState<string | null>(null);

  const geminiRetry = Boolean(onBundleReplace);
  const [freq, setFreq] = useState<Freq>("quarterly");
  const [timeRange, setTimeRange] = useState<ChartTimeRange>("3y");
  const [customFromYear, setCustomFromYear] = useState<number | null>(null);
  const [customToYear, setCustomToYear] = useState<number | null>(null);

  const formatYear = useCallback((fy: string) => t("chart.fyYear", { y: fy }), [t]);

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

  const baseRows = useMemo((): Row[] => {
    return freq === "annual" ? buildAnnualRows(data, formatYear) : buildQuarterlyRows(data, formatPeriod);
  }, [data, freq, formatYear, formatPeriod]);

  const yearOptions = useMemo(() => yearOptionsFromRows(baseRows), [baseRows]);

  useEffect(() => {
    if (timeRange !== "custom" || yearOptions.length === 0) return;
    const minY = yearOptions[0];
    const maxY = yearOptions[yearOptions.length - 1];
    setCustomFromYear((prev) => {
      if (prev == null) return minY;
      return Math.max(minY, Math.min(maxY, prev));
    });
    setCustomToYear((prev) => {
      if (prev == null) return maxY;
      return Math.max(minY, Math.min(maxY, prev));
    });
  }, [timeRange, yearOptions]);

  const filteredBaseRows = useMemo((): Row[] => {
    if (baseRows.length === 0) return [];
    if (timeRange === "custom") {
      if (customFromYear == null || customToYear == null) return baseRows;
      return filterByFiscalYearRange(baseRows, customFromYear, customToYear);
    }
    if (timeRange === "all") return baseRows;
    const y = { "1y": 1, "3y": 3, "5y": 5, "10y": 10 }[timeRange];
    return filterByCalendarYears(baseRows, y);
  }, [baseRows, timeRange, customFromYear, customToYear]);

  const runGeminiBalanceFill = useCallback(async () => {
    if (!onBundleReplace) return;
    setGeminiBusy(true);
    setGeminiFillHint(null);
    try {
      const focusPeriodEnds = filteredBaseRows
        .map((r) => (typeof r.periodEnd === "string" ? r.periodEnd.slice(0, 10) : null))
        .filter((x): x is string => Boolean(x));
      const res = await fetch("/api/stock/gemini-balance-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: symbol,
          bundle: data,
          ...(focusPeriodEnds.length > 0 ? { focusPeriodEnds } : {}),
        }),
      });
      const j = (await res.json()) as { ok?: boolean; bundle?: StockAnalysisBundle; error?: string };
      if (!res.ok) {
        setGeminiFillHint(j.error ?? t("chartsFund.geminiFillNoChange"));
        return;
      }
      if (j.bundle && j.ok) {
        onBundleReplace(j.bundle);
        setGeminiFillHint(null);
      } else {
        setGeminiFillHint(j.error ?? t("chartsFund.geminiFillNoChange"));
      }
    } finally {
      setGeminiBusy(false);
    }
  }, [onBundleReplace, symbol, data, filteredBaseRows, t]);

  const rows = useMemo(() => enrichPopGrowth(filteredBaseRows), [filteredBaseRows]);

  const chartRows = useMemo(() => rowsForCharts(rows), [rows]);

  const loadedMeta = useMemo(() => {
    if (baseRows.length === 0 || yearOptions.length === 0) return null;
    return {
      fromY: yearOptions[0],
      toY: yearOptions[yearOptions.length - 1],
      n: baseRows.length,
    };
  }, [baseRows, yearOptions]);

  /** Inclusive calendar-year span of distinct period-end years (matches x-axis density, not Yahoo depth). */
  const loadedCalendarYearSpan = useMemo(() => {
    if (yearOptions.length === 0) return 0;
    return yearOptions[yearOptions.length - 1] - yearOptions[0] + 1;
  }, [yearOptions]);

  const presetYearsRequested: number | null =
    timeRange === "all" || timeRange === "custom"
      ? null
      : ({ "1y": 1, "3y": 3, "5y": 5, "10y": 10 } as const)[timeRange];

  /** Preset (1y–10y) did not remove any rows — chart matches “All history”. */
  const presetMatchesAllLoaded =
    chartRows.length > 0 &&
    timeRange !== "all" &&
    timeRange !== "custom" &&
    chartRows.length === baseRows.length;

  /** User asked for a longer calendar window than distinct years in the loaded series (e.g. “10y” but only FY 2022–2025). */
  const showPresetShorterThanRequested =
    Boolean(loadedMeta) &&
    presetMatchesAllLoaded &&
    presetYearsRequested != null &&
    loadedCalendarYearSpan > 0 &&
    presetYearsRequested > loadedCalendarYearSpan;

  const showFilterCount =
    chartRows.length > 0 &&
    (timeRange === "custom" || chartRows.length !== baseRows.length);

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
  const hasNetDebtEbitda = useMemo(
    () => rows.some((r) => r.netDebtToEbitda != null && Number.isFinite(r.netDebtToEbitda as number)),
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
  const hasArInv = useMemo(
    () =>
      rows.some(
        (r) =>
          (r.ar != null && Number.isFinite(r.ar as number)) ||
          (r.inventory != null && Number.isFinite(r.inventory as number)),
      ),
    [rows],
  );
  const hasGwLt = useMemo(
    () =>
      rows.some(
        (r) =>
          (r.goodwill != null && Number.isFinite(r.goodwill as number)) ||
          (r.longTermDebt != null && Number.isFinite(r.longTermDebt as number)),
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
      grossSolo: [{ dataKey: "grossProfit", color: C.gross, label: t("income.grossProfit") }] satisfies FundamentalSeries[],
      netIncomeSolo: [{ dataKey: "netIncome", color: C.netIncome, label: t("income.netIncome") }] satisfies FundamentalSeries[],
      dilutedEpsSolo: [{ dataKey: "dilutedEps", color: "#f472b6", label: t("annual.dilutedEps") }] satisfies FundamentalSeries[],
      dilutedSharesSolo: [
        { dataKey: "dilutedShares", color: "#94a3b8", label: t("annual.dilutedShares") },
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
      ebitdaNi: [
        { dataKey: "ebitda", color: C.ebitda, label: t("annual.ebitda") },
        { dataKey: "netIncome", color: C.netIncome, label: t("income.netIncome") },
      ] satisfies FundamentalSeries[],
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
      cashDebt: [
        { dataKey: "cash", color: C.cash, label: t("annual.cash") },
        { dataKey: "netDebt", color: C.netDebt, label: t("annual.netDebt") },
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
      arInv: [
        { dataKey: "ar", color: C.ar, label: t("annual.accountsReceivable") },
        { dataKey: "inventory", color: C.inv, label: t("annual.inventory") },
      ] satisfies FundamentalSeries[],
      gwLt: [
        { dataKey: "goodwill", color: C.gw, label: t("annual.goodwill") },
        { dataKey: "longTermDebt", color: C.ltDebt, label: t("annual.longTermDebt") },
      ] satisfies FundamentalSeries[],
      ebitdaOcfMargin: [
        { dataKey: "ebitdaMargin", color: C.ebitda, label: t("chartsFund.seriesEbitdaMargin") },
        { dataKey: "ocfMargin", color: C.ocf, label: t("chartsFund.seriesOcfMargin") },
      ] satisfies FundamentalSeries[],
      debtPctCapital: [{ dataKey: "debtPctCapital", color: C.debt, label: t("chartsFund.debtPctCapitalLabel") }] satisfies FundamentalSeries[],
      netDebtEbitda: [{ dataKey: "netDebtToEbitda", color: C.netDebt, label: t("chartsFund.seriesNetDebtEbitda") }] satisfies FundamentalSeries[],
      quickRatio: [{ dataKey: "quickRatio", color: C.ocf, label: t("chartsFund.chartQuickRatio") }] satisfies FundamentalSeries[],
      capexIntensity: [{ dataKey: "capexIntensity", color: C.capex, label: t("chartsFund.seriesCapexIntensity") }] satisfies FundamentalSeries[],
    }),
    [t],
  );

  const empty = chartRows.length === 0;

  const selectClass =
    "h-9 min-w-[8.5rem] rounded-md border border-white/10 bg-zinc-950 px-3 text-sm text-foreground shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-emerald-500/50";

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-white/10 bg-zinc-900/35 p-4 shadow-sm shadow-black/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight">{t("chartsFund.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("chartsFund.subtitle")}</p>
            <p className="mt-2 text-xs text-muted-foreground/90">{t("chartsFund.chartMetricNoDataDetail")}</p>
            {geminiFillHint ? (
              <p className="mt-2 text-xs text-amber-400/95" role="status">
                {geminiFillHint}
              </p>
            ) : null}
          </div>
          <div className="flex w-full max-w-xl flex-col gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-end lg:max-w-2xl lg:justify-end">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="fund-chart-range" className="text-xs text-muted-foreground">
                {t("chartsFund.filterTimeRange")}
              </Label>
              <select
                id="fund-chart-range"
                className={selectClass}
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as ChartTimeRange)}
              >
                <option value="all">{t("chartsFund.rangeAll")}</option>
                <option value="10y">{t("chartsFund.range10y")}</option>
                <option value="5y">{t("chartsFund.range5y")}</option>
                <option value="3y">{t("chartsFund.range3y")}</option>
                <option value="1y">{t("chartsFund.range1y")}</option>
                <option value="custom">{t("chartsFund.rangeCustom")}</option>
              </select>
            </div>
            {timeRange === "custom" && yearOptions.length > 0 ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fund-from-y" className="text-xs text-muted-foreground">
                    {t("chartsFund.filterFromYear")}
                  </Label>
                  <select
                    id="fund-from-y"
                    className={selectClass}
                    value={customFromYear ?? yearOptions[0]}
                    onChange={(e) => setCustomFromYear(Number(e.target.value))}
                  >
                    {yearOptions.map((y) => (
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
                    value={customToYear ?? yearOptions[yearOptions.length - 1]}
                    onChange={(e) => setCustomToYear(Number(e.target.value))}
                  >
                    {yearOptions.map((y) => (
                      <option key={`t-${y}`} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">{t("chartsFund.filterGranularity")}</span>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={freq === "quarterly" ? "default" : "outline"}
                  className={cn(
                    "rounded-lg",
                    freq === "quarterly" && "bg-emerald-600 text-white hover:bg-emerald-600/90",
                  )}
                  onClick={() => setFreq("quarterly")}
                  disabled={!hasQuarterly}
                  title={!hasQuarterly ? t("chartsFund.quarterlyUnavailable") : undefined}
                >
                  {t("chartsFund.quarterly")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={freq === "annual" ? "default" : "outline"}
                  className={cn(
                    "rounded-lg",
                    freq === "annual" && "bg-emerald-600 text-white hover:bg-emerald-600/90",
                  )}
                  onClick={() => setFreq("annual")}
                >
                  {t("chartsFund.annual")}
                </Button>
              </div>
            </div>
          </div>
        </div>
        {!empty && loadedMeta ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("chartsFund.loadedDataSpan", {
              fromYear: loadedMeta.fromY,
              toYear: loadedMeta.toY,
              n: loadedMeta.n,
              unit: freq === "annual" ? t("chartsFund.filterUnitYears") : t("chartsFund.filterUnitQuarters"),
            })}
          </p>
        ) : null}
        {showPresetShorterThanRequested && loadedMeta ? (
          <p className="mt-1 text-xs text-amber-200/85">
            {t("chartsFund.filterPresetShorterThanRequested", {
              presetYears: presetYearsRequested!,
              n: loadedMeta.n,
              unit: freq === "annual" ? t("chartsFund.filterUnitYears") : t("chartsFund.filterUnitQuarters"),
              fromYear: loadedMeta.fromY,
              toYear: loadedMeta.toY,
              loadedSpanYears: loadedCalendarYearSpan,
            })}
          </p>
        ) : presetMatchesAllLoaded ? (
          <p className="mt-1 text-xs text-amber-200/85">
            {t("chartsFund.filterPresetNoNarrow")}
          </p>
        ) : null}
        {showFilterCount ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("chartsFund.filterShowing", {
              n: chartRows.length,
              unit: freq === "annual" ? t("chartsFund.filterUnitYears") : t("chartsFund.filterUnitQuarters"),
            })}
          </p>
        ) : null}
      </div>

      {empty ? (
        <p className="text-sm text-muted-foreground">{t("chartsFund.noRows")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <FundamentalChartCard
            title={t("chartsFund.chartRevenue")}
            description={t("chartsFund.chartRevenueDesc")}
            data={chartRows}
            series={series.revenue}
            chartType="bar"
            valueFormat="currency"
          />
          <FundamentalChartCard
            title={t("chartsFund.chartGrossProfitSolo")}
            description={t("chartsFund.chartGrossProfitSoloDesc")}
            data={chartRows}
            series={series.grossSolo}
            chartType="bar"
            valueFormat="currency"
          />
          <FundamentalChartCard
            title={t("chartsFund.chartNetIncomeSolo")}
            description={t("chartsFund.chartNetIncomeSoloDesc")}
            data={chartRows}
            series={series.netIncomeSolo}
            chartType="line"
            valueFormat="currency"
          />
          {hasDilutedEps ? (
            <FundamentalChartCard
              title={t("chartsFund.chartDilutedEps")}
              description={t("chartsFund.chartDilutedEpsDesc")}
              data={chartRows}
              series={series.dilutedEpsSolo}
              chartType="line"
              valueFormat="perShare"
            />
          ) : null}
          {hasDilutedShares ? (
            <FundamentalChartCard
              title={t("chartsFund.chartDilutedShares")}
              description={t("chartsFund.chartDilutedSharesDesc")}
              data={chartRows}
              series={series.dilutedSharesSolo}
              chartType="line"
              valueFormat="compactCount"
            />
          ) : null}
          {hasOperatingIncome ? (
            <FundamentalChartCard
              title={t("chartsFund.chartOperatingIncomeSolo")}
              description={t("chartsFund.chartOperatingIncomeSoloDesc")}
              data={chartRows}
              series={series.operatingIncomeSolo}
              chartType="line"
              valueFormat="currency"
            />
          ) : null}
          <FundamentalChartCard
            title={t("chartsFund.chartOpexSolo")}
            description={t("chartsFund.chartOpexSoloDesc")}
            data={chartRows}
            series={series.opexSolo}
            chartType="bar"
            valueFormat="currency"
          />
          <FundamentalChartCard
            title={t("chartsFund.chartMargins")}
            description={t("chartsFund.chartMarginsDesc")}
            data={chartRows}
            series={series.margins}
            chartType="line"
            valueFormat="percent"
          />
          {hasEbitda ? (
            <FundamentalChartCard
              title={t("chartsFund.chartEbitdaNi")}
              description={t("chartsFund.chartEbitdaNiDesc")}
              data={chartRows}
              series={series.ebitdaNi}
              chartType="line"
              valueFormat="currency"
            />
          ) : null}
          <FundamentalChartCard
            title={t("chartsFund.chartOcfSolo")}
            description={t("chartsFund.chartOcfSoloDesc")}
            data={chartRows}
            series={series.ocfSolo}
            chartType="bar"
            valueFormat="currency"
          />
          <FundamentalChartCard
            title={t("chartsFund.chartFcfSolo")}
            description={t("chartsFund.chartFcfSoloDesc")}
            data={chartRows}
            series={series.fcfSolo}
            chartType="bar"
            valueFormat="currency"
          />
          <FundamentalChartCard
            title={t("chartsFund.chartCapexSolo")}
            description={t("chartsFund.chartCapexSoloDesc")}
            data={chartRows}
            series={series.capexSolo}
            chartType="bar"
            valueFormat="currency"
          />
          <FundamentalChartCard
            title={t("chartsFund.chartInvestFinance")}
            description={t("chartsFund.chartInvestFinanceDesc")}
            data={chartRows}
            series={series.investFinance}
            chartType="bar"
            valueFormat="currency"
          />
          <FundamentalChartCard
            title={t("chartsFund.chartBalance")}
            description={t("chartsFund.chartBalanceDesc")}
            data={chartRows}
            series={series.balance3}
            chartType="line"
            valueFormat="currency"
            geminiRetry={geminiRetry}
            onGeminiRetry={runGeminiBalanceFill}
            geminiRetryPending={geminiBusy}
          />
          <FundamentalChartCard
            title={t("chartsFund.chartCashNetDebt")}
            description={t("chartsFund.chartCashNetDebtDesc")}
            data={chartRows}
            series={series.cashDebt}
            chartType="line"
            valueFormat="currency"
            geminiRetry={geminiRetry}
            onGeminiRetry={runGeminiBalanceFill}
            geminiRetryPending={geminiBusy}
          />
          <FundamentalChartCard
            title={t("chartsFund.chartRoeRoa")}
            description={t("chartsFund.chartRoeRoaDesc")}
            data={chartRows}
            series={series.roeRoa}
            chartType="line"
            valueFormat="percent"
            geminiRetry={geminiRetry}
            onGeminiRetry={runGeminiBalanceFill}
            geminiRetryPending={geminiBusy}
          />
          <FundamentalChartCard
            title={t("chartsFund.chartCurrentRatio")}
            description={t("chartsFund.chartCurrentRatioDesc")}
            data={chartRows}
            series={series.currentRatio}
            chartType="line"
            valueFormat="ratio"
            geminiRetry={geminiRetry}
            onGeminiRetry={runGeminiBalanceFill}
            geminiRetryPending={geminiBusy}
          />
          <FundamentalChartCard
            title={t("chartsFund.chartFcfMargin")}
            description={t("chartsFund.chartFcfMarginDesc")}
            data={chartRows}
            series={series.fcfMargin}
            chartType="line"
            valueFormat="percent"
          />
          <FundamentalChartCard
            title={t("chartsFund.chartPopGrowth")}
            description={freq === "annual" ? t("chartsFund.chartPopGrowthDescAnnual") : t("chartsFund.chartPopGrowthDescQ")}
            data={chartRows}
            series={series.popGrowth}
            chartType="line"
            valueFormat="percent"
          />
          {hasShareholderFlows ? (
            <FundamentalChartCard
              title={t("chartsFund.chartShareholder")}
              description={t("chartsFund.chartShareholderDesc")}
              data={chartRows}
              series={series.shareholder}
              chartType="bar"
              valueFormat="currency"
            />
          ) : null}
          {hasArInv ? (
            <FundamentalChartCard
              title={t("chartsFund.chartArInv")}
              description={t("chartsFund.chartArInvDesc")}
              data={chartRows}
              series={series.arInv}
              chartType="line"
              valueFormat="currency"
              geminiRetry={geminiRetry}
              onGeminiRetry={runGeminiBalanceFill}
              geminiRetryPending={geminiBusy}
            />
          ) : null}
          {hasGwLt ? (
            <FundamentalChartCard
              title={t("chartsFund.chartGwLt")}
              description={t("chartsFund.chartGwLtDesc")}
              data={chartRows}
              series={series.gwLt}
              chartType="line"
              valueFormat="currency"
              geminiRetry={geminiRetry}
              onGeminiRetry={runGeminiBalanceFill}
              geminiRetryPending={geminiBusy}
            />
          ) : null}
          {hasEbitdaOcfMargins ? (
            <FundamentalChartCard
              title={t("chartsFund.chartEbitdaOcfMargin")}
              description={t("chartsFund.chartEbitdaOcfMarginDesc")}
              data={chartRows}
              series={series.ebitdaOcfMargin}
              chartType="line"
              valueFormat="percent"
            />
          ) : null}
          <FundamentalChartCard
            title={t("chartsFund.chartDebtPctCapital")}
            description={t("chartsFund.chartDebtPctCapitalDesc")}
            data={chartRows}
            series={series.debtPctCapital}
            chartType="line"
            valueFormat="percent"
            geminiRetry={geminiRetry}
            onGeminiRetry={runGeminiBalanceFill}
            geminiRetryPending={geminiBusy}
          />
          {hasNetDebtEbitda ? (
            <FundamentalChartCard
              title={t("chartsFund.chartNetDebtEbitda")}
              description={t("chartsFund.chartNetDebtEbitdaDesc")}
              data={chartRows}
              series={series.netDebtEbitda}
              chartType="line"
              valueFormat="ratio"
              geminiRetry={geminiRetry}
              onGeminiRetry={runGeminiBalanceFill}
              geminiRetryPending={geminiBusy}
            />
          ) : null}
          <FundamentalChartCard
            title={t("chartsFund.chartQuickRatio")}
            description={t("chartsFund.chartQuickRatioDesc")}
            data={chartRows}
            series={series.quickRatio}
            chartType="line"
            valueFormat="ratio"
            geminiRetry={geminiRetry}
            onGeminiRetry={runGeminiBalanceFill}
            geminiRetryPending={geminiBusy}
          />
          <FundamentalChartCard
            title={t("chartsFund.chartCapexIntensity")}
            description={t("chartsFund.chartCapexIntensityDesc")}
            data={chartRows}
            series={series.capexIntensity}
            chartType="line"
            valueFormat="percent"
          />
        </div>
      )}
    </div>
  );
}
