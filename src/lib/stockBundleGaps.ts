import { bundleHasBalanceSheetOrDividendGaps } from "@/lib/geminiBalanceSheetGapFill";
import { isEmptyIncomeStatementCore, type StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

/**
 * True when Yahoo/SEC left something missing for the fundamentals UI: empty fiscal slots,
 * sparse income rows, many null cash-flow fields, or BS/DPS gaps Gemini can patch.
 */
export function bundleHasYahooSecDataGaps(
  bundle: StockAnalysisBundle,
  displayFiscalYears: string[],
): boolean {
  const loadedSet = new Set(bundle.income.map((r) => r.fiscalYear));
  const missingYears = displayFiscalYears.filter((y) => !loadedSet.has(y));
  if (missingYears.length > 0) return true;

  const incByFy = new Map(bundle.income.map((r) => [r.fiscalYear, r]));
  for (const y of displayFiscalYears) {
    const row = incByFy.get(y);
    if (row && isEmptyIncomeStatementCore(row)) return true;
  }

  for (const q of bundle.incomeQuarterly.slice(-28)) {
    if (isEmptyIncomeStatementCore(q)) return true;
  }

  const cf = bundle.cashFlowQuarterly;
  const inc = bundle.incomeQuarterly;
  if (cf.length === inc.length && cf.length >= 4) {
    let nullOcf = 0;
    for (let i = 0; i < cf.length; i++) {
      if (cf[i].operatingCashFlow == null) nullOcf++;
    }
    if (nullOcf / cf.length > 0.25) return true;
  }

  const divTail = bundle.dividendQuarterly.slice(-12);
  if (
    divTail.length > 0 &&
    divTail.every((p) => p.dividendPerShare == null) &&
    ((bundle.investor.dividendYield != null && bundle.investor.dividendYield > 1e-8) ||
      (bundle.investor.dividendRate != null && bundle.investor.dividendRate > 0))
  ) {
    return true;
  }

  if (bundleHasBalanceSheetOrDividendGaps(bundle)) return true;

  return false;
}
