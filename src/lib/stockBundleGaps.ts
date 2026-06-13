import {
  isEmptyIncomeStatementCore,
  type BalanceSheetAnnual,
  type BalanceSheetQuarter,
  type StockAnalysisBundle,
} from "@/lib/stockAnalysisTypes";

function bundleHasBalanceSheetOrDividendGaps(bundle: StockAnalysisBundle): boolean {
  const rowGap = (r: BalanceSheetAnnual | BalanceSheetQuarter) =>
    r.totalAssets == null || r.stockholdersEquity == null || r.totalDebt == null;

  const quickRatioGap = (r: BalanceSheetAnnual | BalanceSheetQuarter) => {
    const tca = r.totalCurrentAssets;
    const tcl = r.totalCurrentLiabilities;
    if (tca == null || tcl == null) return true;
    if (r.inventory == null) return true;
    return false;
  };

  if (bundle.balanceSheet.some((r) => rowGap(r) || quickRatioGap(r))) return true;
  if (bundle.balanceSheetQuarterly.some((r) => rowGap(r) || quickRatioGap(r))) return true;

  const tail = bundle.dividendQuarterly.slice(-20);
  if (!tail.some((p) => p.dividendPerShare == null)) return false;
  const inv = bundle.investor;
  const pays =
    (inv.dividendRate != null && inv.dividendRate > 0) ||
    (inv.dividendYield != null && inv.dividendYield > 1e-8) ||
    bundle.dividendQuarterly.some((p) => p.dividendPerShare != null && p.dividendPerShare > 0);
  return pays;
}

/** Per-share figures EDGAR omits for dimensional (multi-class) filers like Visa. */
function bundleHasEpsGaps(bundle: StockAnalysisBundle, displayFiscalYears: string[]): boolean {
  const incByFy = new Map(bundle.income.map((r) => [r.fiscalYear, r]));
  for (const y of displayFiscalYears) {
    const row = incByFy.get(y);
    if (row && row.netIncome !== 0 && row.dilutedEps == null) return true;
  }
  const recent = bundle.incomeQuarterly.slice(-12).filter((q) => q.netIncome !== 0);
  if (recent.length >= 4) {
    const missing = recent.filter((q) => q.dilutedEps == null).length;
    if (missing / recent.length > 0.25) return true;
  }
  return false;
}

/**
 * True when data still looks incomplete for the fundamentals UI: empty fiscal slots,
 * sparse rows, many null cash-flow fields, or BS/DPS gaps after Gemini + Yahoo merge.
 */
export function bundleHasYahooSecDataGaps(
  bundle: StockAnalysisBundle,
  displayFiscalYears: string[],
): boolean {
  const loadedSet = new Set(bundle.income.map((r) => r.fiscalYear));
  const missingYears = displayFiscalYears.filter((y) => !loadedSet.has(y));
  if (missingYears.length > 0) return true;

  if (bundleHasEpsGaps(bundle, displayFiscalYears)) return true;

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
  const hasSomeHistoricDps = bundle.dividendQuarterly.some(
    (p) => p.dividendPerShare != null && p.dividendPerShare > 0,
  );
  const investorSaysDividend =
    (bundle.investor.dividendYield != null && bundle.investor.dividendYield > 1e-8) ||
    (bundle.investor.dividendRate != null && bundle.investor.dividendRate > 0);
  if (
    divTail.length > 0 &&
    divTail.every((p) => p.dividendPerShare == null) &&
    (investorSaysDividend || hasSomeHistoricDps)
  ) {
    return true;
  }

  if (bundleHasBalanceSheetOrDividendGaps(bundle)) return true;

  return false;
}
