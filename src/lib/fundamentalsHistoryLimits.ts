import { alignAnnualToIncome, alignQuarterlyToIncome } from "@/lib/quarterlyAlign";
import {
  sortQuarterlyByDateAsc,
  type StockAnalysisBundle,
} from "@/lib/stockAnalysisTypes";

export const FUNDAMENTALS_HISTORY_YEARS = 5;
export const FUNDAMENTALS_MAX_QUARTERS = FUNDAMENTALS_HISTORY_YEARS * 4;

/** Yahoo fundamentalsTimeSeries period1 (rolling 5 calendar years). */
export function fundamentalsPeriod1Iso(asOf: Date = new Date()): string {
  const d = new Date(asOf);
  d.setUTCFullYear(d.getUTCFullYear() - FUNDAMENTALS_HISTORY_YEARS);
  return d.toISOString().slice(0, 10);
}

function sortAnnualByFyLocal<T extends { fiscalYear: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(a.fiscalYear) - Number(b.fiscalYear));
}

/** Keep last N annual FY rows and last M quarterly rows across all statement series. */
export function trimBundleToFundamentalsWindow(bundle: StockAnalysisBundle): void {
  const sym = bundle.quote.symbol.trim().toUpperCase();

  const trimAnnual = <T extends { fiscalYear: string }>(rows: T[]): T[] => {
    const sorted = sortAnnualByFyLocal(rows);
    return sorted.slice(-Math.min(FUNDAMENTALS_HISTORY_YEARS, sorted.length));
  };

  bundle.income = trimAnnual(bundle.income);
  bundle.cashFlow = trimAnnual(bundle.cashFlow);
  bundle.balanceSheet = trimAnnual(bundle.balanceSheet);

  const alignedAnnual = alignAnnualToIncome(sym, bundle.income, bundle.cashFlow, bundle.balanceSheet);
  bundle.cashFlow = alignedAnnual.cashFlow;
  bundle.balanceSheet = alignedAnnual.balanceSheet;

  const takeQ = (rows: { date: string }[]) => {
    const sorted = sortQuarterlyByDateAsc(rows as StockAnalysisBundle["incomeQuarterly"]);
    return sorted.slice(-Math.min(FUNDAMENTALS_MAX_QUARTERS, sorted.length));
  };

  bundle.incomeQuarterly = takeQ(bundle.incomeQuarterly);
  const alignedQ = alignQuarterlyToIncome(
    sym,
    bundle.incomeQuarterly,
    bundle.cashFlowQuarterly,
    bundle.balanceSheetQuarterly,
    bundle.dividendQuarterly,
  );
  bundle.cashFlowQuarterly = alignedQ.cashFlowQuarterly;
  bundle.balanceSheetQuarterly = alignedQ.balanceSheetQuarterly;
  bundle.dividendQuarterly = alignedQ.dividendQuarterly;
}
