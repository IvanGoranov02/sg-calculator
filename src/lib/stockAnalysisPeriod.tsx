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

export type ChartTimeRange = "all" | "10y" | "5y" | "3y" | "1y" | "custom";

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
  return new Date(r.date).getFullYear();
}

/** Filter annual statement rows to match the fundamentals chart time range (fallback: all rows if empty). */
export function filterAnnualRowsByPeriod<T extends { fiscalYear: string; date: string }>(
  rows: T[],
  timeRange: ChartTimeRange,
  customFromYear: number | null,
  customToYear: number | null,
): T[] {
  if (rows.length === 0) return rows;
  const sorted = [...rows].sort((a, b) => fiscalYearFromRow(a) - fiscalYearFromRow(b));
  if (timeRange === "all") return sorted;

  if (timeRange === "custom") {
    if (customFromYear == null || customToYear == null) return sorted;
    const lo = Math.min(customFromYear, customToYear);
    const hi = Math.max(customFromYear, customToYear);
    const out = sorted.filter((r) => {
      const y = fiscalYearFromRow(r);
      return y >= lo && y <= hi;
    });
    return out.length > 0 ? out : sorted;
  }

  const years = { "1y": 1, "3y": 3, "5y": 5, "10y": 10 }[timeRange];
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  const cutoffYear = cutoff.getFullYear();
  const out = sorted.filter((r) => fiscalYearFromRow(r) >= cutoffYear);
  return out.length > 0 ? out : sorted;
}

/** Filter dividend quarterly points the same way as chart rows (by period-end date). */
export function filterDividendQuarterlyByPeriod(
  points: DividendQuarterlyPoint[],
  timeRange: ChartTimeRange,
  customFromYear: number | null,
  customToYear: number | null,
): DividendQuarterlyPoint[] {
  if (points.length === 0) return points;
  const sorted = sortQuarterlyByDateAsc(points);
  if (timeRange === "all") return sorted;

  if (timeRange === "custom") {
    if (customFromYear == null || customToYear == null) return sorted;
    const lo = Math.min(customFromYear, customToYear);
    const hi = Math.max(customFromYear, customToYear);
    const out = sorted.filter((p) => {
      const y = new Date(`${p.date.slice(0, 10)}T12:00:00Z`).getFullYear();
      return y >= lo && y <= hi;
    });
    return out.length > 0 ? out : sorted;
  }

  const y = { "1y": 1, "3y": 3, "5y": 5, "10y": 10 }[timeRange];
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - y);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const out = sorted.filter((p) => p.date.slice(0, 10) >= cutoffStr);
  return out.length > 0 ? out : sorted;
}
