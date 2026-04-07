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

export type { ChartTimeRange, FundamentalsFreq } from "@/lib/stockPeriodCore";
export {
  annualDataYearBounds,
  annualDisplayFiscalYears,
  filterAnnualRowsByPeriod,
  filterDividendQuarterlyByPeriod,
  filterQuarterlyChartRowsByPeriod,
  maxAnnualFiscalYearFromBundle,
  quarterlyDataYearBounds,
  quarterlyFilterYearBounds,
  quarterlyPeriodEndInRange,
} from "@/lib/stockPeriodCore";

import type { ChartTimeRange, FundamentalsFreq } from "@/lib/stockPeriodCore";

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
