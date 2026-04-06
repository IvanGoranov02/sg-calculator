"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import type { DividendQuarterlyPoint } from "@/lib/stockAnalysisTypes";
import { sortQuarterlyByDateAsc } from "@/lib/stockAnalysisTypes";

/** Max history in bundle is 10y; UI presets top out at 10y (no “all time”). */
export type ChartTimeRange = "10y" | "5y" | "3y" | "1y" | "custom";

export type FundamentalsFreq = "annual" | "quarterly";

type PeriodContextValue = {
  timeRange: ChartTimeRange;
  setTimeRange: Dispatch<SetStateAction<ChartTimeRange>>;
  freq: FundamentalsFreq;
  setFreq: Dispatch<SetStateAction<FundamentalsFreq>>;
  customFromYear: number | null;
  setCustomFromYear: Dispatch<SetStateAction<number | null>>;
  customToYear: number | null;
  setCustomToYear: Dispatch<SetStateAction<number | null>>;
};

const StockAnalysisPeriodContext = createContext<PeriodContextValue | null>(null);

export function StockAnalysisPeriodProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [timeRange, setTimeRange] = useState<ChartTimeRange>("3y");
  const [freq, setFreq] = useState<FundamentalsFreq>("quarterly");
  const [customFromYear, setCustomFromYear] = useState<number | null>(null);
  const [customToYear, setCustomToYear] = useState<number | null>(null);

  const value = useMemo<PeriodContextValue>(
    () => ({
      timeRange,
      setTimeRange,
      freq,
      setFreq,
      customFromYear,
      setCustomFromYear,
      customToYear,
      setCustomToYear,
    }),
    [timeRange, freq, customFromYear, customToYear],
  );

  return (
    <StockAnalysisPeriodContext.Provider value={value}>{children}</StockAnalysisPeriodContext.Provider>
  );
}

export function useStockAnalysisPeriod(): PeriodContextValue {
  const ctx = useContext(StockAnalysisPeriodContext);
  if (!ctx) {
    throw new Error("useStockAnalysisPeriod must be used within StockAnalysisPeriodProvider");
  }
  return ctx;
}

function fiscalYearFromRow(r: { fiscalYear: string; date: string }): number {
  const fy = parseInt(r.fiscalYear, 10);
  if (Number.isFinite(fy)) return fy;
  return new Date(r.date).getUTCFullYear();
}

export function annualDataYearBounds<T extends { fiscalYear: string; date: string }>(rows: T[]): {
  min: number;
  max: number;
} | null {
  let min = Infinity;
  let max = -Infinity;
  for (const r of rows) {
    const y = fiscalYearFromRow(r);
    if (!Number.isFinite(y)) continue;
    min = Math.min(min, y);
    max = Math.max(max, y);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

/** Latest fiscal year present in annual income, cash flow, or balance sheet (for table column anchoring). */
export function maxAnnualFiscalYearFromBundle(bundle: {
  income: { fiscalYear: string; date: string }[];
  cashFlow: { fiscalYear: string; date: string }[];
  balanceSheet: { fiscalYear: string; date: string }[];
}): number | null {
  let maxY = -Infinity;
  for (const arr of [bundle.income, bundle.cashFlow, bundle.balanceSheet]) {
    for (const r of arr) {
      const y = fiscalYearFromRow(r);
      if (Number.isFinite(y)) maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(maxY) || maxY === -Infinity) return null;
  return maxY;
}

function fiscalYearStringRangeInclusive(a: number, b: number): string[] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const out: string[] = [];
  for (let y = lo; y <= hi; y++) out.push(String(y));
  return out;
}

/**
 * Fiscal year **columns** for annual tables: presets use a fixed count (e.g. 10y → 10) ending at the latest FY
 * in the bundle (fallback: current calendar year if nothing loaded). Missing FYs still get a column (empty cells).
 */
export function annualDisplayFiscalYears(
  bundle: {
    income: { fiscalYear: string; date: string }[];
    cashFlow: { fiscalYear: string; date: string }[];
    balanceSheet: { fiscalYear: string; date: string }[];
  },
  timeRange: ChartTimeRange,
  customFromYear: number | null,
  customToYear: number | null,
): string[] {
  const incomeSorted = [...bundle.income].sort((x, y) => fiscalYearFromRow(x) - fiscalYearFromRow(y));

  if (timeRange === "custom") {
    const bounds = annualDataYearBounds(incomeSorted);
    const lo = customFromYear ?? bounds?.min ?? new Date().getUTCFullYear() - 5;
    const hi = customToYear ?? bounds?.max ?? new Date().getUTCFullYear();
    return fiscalYearStringRangeInclusive(lo, hi);
  }

  const n = { "1y": 1, "3y": 3, "5y": 5, "10y": 10 }[timeRange];
  const end =
    maxAnnualFiscalYearFromBundle(bundle) ?? new Date().getUTCFullYear();
  const start = end - n + 1;
  return fiscalYearStringRangeInclusive(start, end);
}

export function quarterlyDataYearBounds(dates: string[]): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const d of dates) {
    const y = new Date(`${d.slice(0, 10)}T12:00:00Z`).getUTCFullYear();
    if (!Number.isFinite(y)) continue;
    min = Math.min(min, y);
    max = Math.max(max, y);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

/**
 * Single min/max calendar years for quarterly filters so fundamentals, dividends, and custom defaults stay aligned
 * when income and dividend arrays differ slightly in length or dates.
 */
export function quarterlyFilterYearBounds(bundle: {
  incomeQuarterly: { date: string }[];
  dividendQuarterly: { date: string }[];
}): { min: number; max: number } | null {
  const dates: string[] = [];
  for (const r of bundle.incomeQuarterly) dates.push(r.date.slice(0, 10));
  for (const r of bundle.dividendQuarterly) dates.push(r.date.slice(0, 10));
  return quarterlyDataYearBounds(dates);
}

/** Quarters to show per preset — mirrors “last N fiscal years” for annual (≈4 quarters per year). */
const PRESET_QUARTER_COUNT: Record<Exclude<ChartTimeRange, "custom">, number> = {
  "1y": 4,
  "3y": 12,
  "5y": 20,
  "10y": 40,
};

/**
 * Filter quarterly chart rows: **presets** keep the last N quarters in **loaded** data (like annual `slice(-n)`),
 * so charts stay populated when Yahoo lags behind “today”. Custom uses calendar rules.
 */
export function filterQuarterlyChartRowsByPeriod<T extends { periodEnd?: string }>(
  rows: T[],
  timeRange: ChartTimeRange,
  customFromYear: number | null,
  customToYear: number | null,
  quarterBounds: { min: number; max: number },
): T[] {
  const withPe = rows.filter((r) => typeof r.periodEnd === "string" && r.periodEnd.length >= 10);
  if (withPe.length === 0) return [];
  const sorted = [...withPe].sort((a, b) =>
    (a.periodEnd as string).slice(0, 10).localeCompare((b.periodEnd as string).slice(0, 10)),
  );

  if (timeRange === "custom") {
    return sorted.filter((r) =>
      quarterlyPeriodEndInRange(
        (r.periodEnd as string).slice(0, 10),
        timeRange,
        customFromYear,
        customToYear,
        quarterBounds.min,
        quarterBounds.max,
      ),
    );
  }

  const take = PRESET_QUARTER_COUNT[timeRange];
  return sorted.slice(-Math.min(take, sorted.length));
}

/** Quarterly / daily period-end: custom calendar-year bounds on period-end (presets use {@link filterQuarterlyChartRowsByPeriod}). */
export function quarterlyPeriodEndInRange(
  dateIso: string,
  timeRange: ChartTimeRange,
  customFromYear: number | null,
  customToYear: number | null,
  dataYearMin: number,
  dataYearMax: number,
): boolean {
  const d = dateIso.slice(0, 10);

  if (timeRange === "custom") {
    const lo = customFromYear ?? dataYearMin;
    const hi = customToYear ?? dataYearMax;
    const a = Math.min(lo, hi);
    const b = Math.max(lo, hi);
    const y = new Date(`${d}T12:00:00Z`).getUTCFullYear();
    return y >= a && y <= b;
  }

  const roll = { "1y": 1, "3y": 3, "5y": 5, "10y": 10 }[timeRange];
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - roll);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return d >= cutoffStr;
}

/**
 * Filter annual statement rows to match the fundamentals chart time range.
 * Presets (1y–10y) keep the **last N fiscal years in loaded data** (not calendar cutoffs), so tables never go empty
 * when the latest FY label is behind the current calendar year.
 */
export function filterAnnualRowsByPeriod<T extends { fiscalYear: string; date: string }>(
  rows: T[],
  timeRange: ChartTimeRange,
  customFromYear: number | null,
  customToYear: number | null,
): T[] {
  if (rows.length === 0) return rows;
  const sorted = [...rows].sort((a, b) => fiscalYearFromRow(a) - fiscalYearFromRow(b));

  if (timeRange === "custom") {
    const bounds = annualDataYearBounds(sorted);
    if (!bounds) return [];
    const lo = customFromYear ?? bounds.min;
    const hi = customToYear ?? bounds.max;
    const a = Math.min(lo, hi);
    const b = Math.max(lo, hi);
    return sorted.filter((r) => {
      const fy = fiscalYearFromRow(r);
      return fy >= a && fy <= b;
    });
  }

  const n = { "1y": 1, "3y": 3, "5y": 5, "10y": 10 }[timeRange];
  return sorted.slice(-Math.min(n, sorted.length));
}

/** Filter dividend quarterly points the same way as quarterly fundamentals (last N quarters in data for presets). */
export function filterDividendQuarterlyByPeriod(
  points: DividendQuarterlyPoint[],
  timeRange: ChartTimeRange,
  customFromYear: number | null,
  customToYear: number | null,
  quarterBounds: { min: number; max: number } | null,
): DividendQuarterlyPoint[] {
  if (points.length === 0) return points;
  const sorted = sortQuarterlyByDateAsc(points);
  const bounds =
    quarterBounds ?? quarterlyDataYearBounds(sorted.map((p) => p.date.slice(0, 10)));
  if (!bounds) return [];

  if (timeRange === "custom") {
    return sorted.filter((p) =>
      quarterlyPeriodEndInRange(
        p.date,
        timeRange,
        customFromYear,
        customToYear,
        bounds.min,
        bounds.max,
      ),
    );
  }

  const take = PRESET_QUARTER_COUNT[timeRange];
  return sorted.slice(-Math.min(take, sorted.length));
}
