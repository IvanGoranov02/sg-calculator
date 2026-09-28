/**
 * Currency reconciliation for listings whose reporting currency differs from the
 * trading currency (ASML files in EUR but the NASDAQ ADR quotes in USD; Meta
 * files in USD but the Xetra line FB2A.DE quotes in EUR). Fundamentals come out
 * in the financial currency; the price and investor metrics in the quote currency.
 * Mixing them breaks P/E, valuation and the charts, so we scale the monetary
 * fundamentals into the quote currency for display (a single current FX rate —
 * an approximation, good enough for the UI).
 *
 * Per-share dividends are the exception: Yahoo ex-dividend cash and
 * `dividendRate` are already in the listing (quote) currency. Scaling those
 * again turns FB2A.DE's ~€0.46 cash dividend into ~€0.40 while the chart still
 * prints a dollar sign.
 */

import type {
  BalanceSheetAnnual,
  BalanceSheetQuarter,
  CashFlowAnnual,
  CashFlowQuarter,
  IncomeStatementAnnual,
  IncomeStatementQuarter,
  StockAnalysisBundle,
} from "@/lib/stockAnalysisTypes";

/** Multiply a monetary value by the FX rate, preserving null. */
function s(v: number | null, rate: number): number | null {
  return v == null || !Number.isFinite(v) ? v : v * rate;
}
/** Required (non-null) monetary field. */
function sReq(v: number, rate: number): number {
  return Number.isFinite(v) ? v * rate : v;
}
/** Optional monetary field (number | undefined). */
function sOpt(v: number | undefined, rate: number): number | undefined {
  return v == null || !Number.isFinite(v) ? v : v * rate;
}

const PAYMENTS_PER_YEAR = [1, 2, 4, 12] as const;

function relativeGap(actual: number, expected: number): number {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || expected === 0) return Infinity;
  return Math.abs(actual - expected) / Math.abs(expected);
}

/** Closest match of one cash amount to annual dividend / payment frequency. */
function bestPaymentGap(amount: number, annual: number): number {
  let best = Infinity;
  for (const freq of PAYMENTS_PER_YEAR) {
    best = Math.min(best, relativeGap(amount, annual / freq));
  }
  return best;
}

/**
 * True when quarterly DPS is already in the quote currency, so FX-scaling it
 * into the quote currency would convert it a second time.
 *
 * Compares the series with `quoteAnnualDividend` (Yahoo `dividendRate`, listing
 * currency). A listing-currency series sits on that rate; a reporting-currency
 * series sits on it only after multiplying by `quotePerFinancial`.
 * Points are ordered by `date` when present.
 */
export function dividendsAlreadyInQuoteCurrency(
  points: Array<{ date?: string; dividendPerShare: number | null }>,
  quoteAnnualDividend: number | null | undefined,
  quotePerFinancial: number,
): boolean {
  if (
    quoteAnnualDividend == null ||
    !Number.isFinite(quoteAnnualDividend) ||
    quoteAnnualDividend <= 0 ||
    !Number.isFinite(quotePerFinancial) ||
    quotePerFinancial <= 0
  ) {
    return false;
  }

  const ordered = [...points].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const latest = [...ordered].reverse().find((p) => p.dividendPerShare != null && p.dividendPerShare > 0);
  if (!latest || latest.dividendPerShare == null) return false;

  const rawGaps = [bestPaymentGap(latest.dividendPerShare, quoteAnnualDividend)];
  const scaledGaps = [bestPaymentGap(latest.dividendPerShare * quotePerFinancial, quoteAnnualDividend)];

  if (ordered.length >= 4) {
    const ttm = ordered.slice(-4).reduce((sum, p) => {
      const v = p.dividendPerShare;
      return sum + (v != null && Number.isFinite(v) && v > 0 ? v : 0);
    }, 0);
    if (ttm > 0) {
      rawGaps.push(relativeGap(ttm, quoteAnnualDividend));
      scaledGaps.push(relativeGap(ttm * quotePerFinancial, quoteAnnualDividend));
    }
  }

  const rawGap = Math.min(...rawGaps);
  const scaledGap = Math.min(...scaledGaps);
  // Clearly closer to the unscaled listing rate, and not a coincidental near-miss.
  return rawGap < scaledGap && rawGap < 0.35;
}

export type DividendOverlayMode = "fill-gaps" | "overwrite";

/**
 * Bucket Yahoo ex-dividend cash into fiscal-quarter windows.
 * Amounts are listing-currency cash. `fill-gaps` only replaces null/0.
 * `overwrite` replaces every quarter Yahoo has cash for (reporting-currency
 * DPS must not survive next to listing-currency cash).
 */
export function overlayQuarterlyDividends<T extends { date: string; dividendPerShare: number | null }>(
  rows: T[],
  events: Array<{ date: string; amount: number }>,
  mode: DividendOverlayMode,
): { rows: T[]; wrote: number; kept: number } {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const next: T[] = [];
  let wrote = 0;
  let kept = 0;

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]!;
    const end = row.date.slice(0, 10);
    const prevEnd = i > 0 ? sorted[i - 1]!.date.slice(0, 10) : "1900-01-01";
    let sum = 0;
    for (const { date: ex, amount } of events) {
      if (ex > prevEnd && ex <= end) sum += amount;
    }
    const rounded = Math.round(sum * 1e6) / 1e6;
    const cur = row.dividendPerShare;
    const replace = rounded > 0 && (mode === "overwrite" || cur == null || cur === 0);
    if (replace) {
      next.push({ ...row, dividendPerShare: rounded });
      wrote += 1;
    } else {
      next.push(row);
      if (cur != null && cur > 0) kept += 1;
    }
  }

  return { rows: next, wrote, kept };
}

/**
 * In-place: convert every monetary fundamental field (and per-share figures) by
 * `rate` = quote-currency units per 1 financial-currency unit. Share *counts*
 * (diluted average shares) are NOT scaled. Mutates and returns the bundle.
 * Pass `convertDividends: false` when DPS is already in the quote currency.
 */
export function convertBundleFundamentals(
  bundle: StockAnalysisBundle,
  rate: number,
  opts?: { convertDividends?: boolean },
): StockAnalysisBundle {
  if (!Number.isFinite(rate) || rate <= 0 || rate === 1) return bundle;

  const income = <T extends IncomeStatementAnnual | IncomeStatementQuarter>(r: T): T =>
    ({
      ...r,
      revenue: sReq(r.revenue, rate),
      grossProfit: sReq(r.grossProfit, rate),
      operatingExpenses: sReq(r.operatingExpenses, rate),
      netIncome: sReq(r.netIncome, rate),
      operatingIncome: sOpt(r.operatingIncome, rate),
      ebitda: sOpt(r.ebitda, rate),
      dilutedEps: sOpt(r.dilutedEps, rate),
      // dilutedAverageShares is a count — left as is.
    }) as T;

  const cf = <T extends CashFlowAnnual | CashFlowQuarter>(r: T): T =>
    ({
      ...r,
      freeCashFlow: sReq(r.freeCashFlow, rate),
      operatingCashFlow: s(r.operatingCashFlow, rate),
      capitalExpenditure: s(r.capitalExpenditure, rate),
      investingCashFlow: s(r.investingCashFlow, rate),
      financingCashFlow: s(r.financingCashFlow, rate),
      dividendsPaid: s(r.dividendsPaid, rate),
      stockRepurchase: s(r.stockRepurchase, rate),
    }) as T;

  const bs = <T extends BalanceSheetAnnual | BalanceSheetQuarter>(r: T): T =>
    ({
      ...r,
      totalAssets: s(r.totalAssets, rate),
      totalDebt: s(r.totalDebt, rate),
      netDebt: s(r.netDebt, rate),
      stockholdersEquity: s(r.stockholdersEquity, rate),
      cashAndCashEquivalents: s(r.cashAndCashEquivalents, rate),
      totalCurrentAssets: s(r.totalCurrentAssets, rate),
      totalCurrentLiabilities: s(r.totalCurrentLiabilities, rate),
      inventory: s(r.inventory, rate),
      accountsReceivable: s(r.accountsReceivable, rate),
      goodwill: s(r.goodwill, rate),
      longTermDebt: s(r.longTermDebt, rate),
    }) as T;

  bundle.income = bundle.income.map(income);
  bundle.incomeQuarterly = bundle.incomeQuarterly.map(income);
  bundle.cashFlow = bundle.cashFlow.map(cf);
  bundle.cashFlowQuarterly = bundle.cashFlowQuarterly.map(cf);
  bundle.balanceSheet = bundle.balanceSheet.map(bs);
  bundle.balanceSheetQuarterly = bundle.balanceSheetQuarterly.map(bs);
  if (opts?.convertDividends !== false) {
    bundle.dividendQuarterly = bundle.dividendQuarterly.map((p) => ({
      ...p,
      dividendPerShare: s(p.dividendPerShare, rate),
    }));
  }

  return bundle;
}
