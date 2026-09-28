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

const MS_PER_DAY = 86_400_000;
/** Used when the series has a single quarter and no gap to measure. */
const DEFAULT_QUARTER_DAYS = 92;

function daysBetweenIso(earlier: string, later: string): number | null {
  const a = Date.parse(`${earlier.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${later.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.round((b - a) / MS_PER_DAY);
}

/** Median spacing of the quarterly series, else one quarter. */
export function medianQuarterGapDays(datesAsc: readonly string[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < datesAsc.length; i++) {
    const gap = daysBetweenIso(datesAsc[i - 1]!, datesAsc[i]!);
    if (gap != null) gaps.push(gap);
  }
  if (gaps.length === 0) return DEFAULT_QUARTER_DAYS;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor((gaps.length - 1) / 2)]!;
}

/**
 * Start of the first fiscal-quarter window. Dividends on or before this date
 * belong to quarters that are not in the series (the ex-div fetch is longer
 * than the 5-year fundamentals window).
 */
export function firstQuarterWindowStart(datesAsc: readonly string[]): string {
  const first = datesAsc[0]?.slice(0, 10);
  if (!first) return "1900-01-01";
  const gap = medianQuarterGapDays(datesAsc);
  const t = Date.parse(`${first}T00:00:00Z`);
  if (!Number.isFinite(t)) return first;
  return new Date(t - gap * MS_PER_DAY).toISOString().slice(0, 10);
}

function roundDividendCash(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * True when the oldest DPS is the pre-clamp open-window sum: every ex-div on or
 * before that quarter-end, including events older than one quarter. The first
 * overwrite commit persisted that sum and did not write `__dividendListingDates`,
 * so the date stamp alone cannot find it. A one-quarter fundamentals DPS does
 * not equal that multi-event sum.
 */
function firstBarIsLegacyOpenWindowSum(
  rows: ReadonlyArray<{ date: string; dividendPerShare: number | null }>,
  events: ReadonlyArray<{ date: string; amount: number }>,
): boolean {
  const dates = rows.map((row) => row.date.slice(0, 10)).sort((a, b) => a.localeCompare(b));
  const end = dates[0];
  if (!end) return false;
  const start = firstQuarterWindowStart(dates);
  let openSum = 0;
  let openCount = 0;
  let sawPreWindow = false;
  for (const event of events) {
    const ex = event.date.slice(0, 10);
    if (!ex || ex > end || !Number.isFinite(event.amount)) continue;
    openSum += event.amount;
    openCount += 1;
    if (ex <= start) sawPreWindow = true;
  }
  if (!sawPreWindow || openCount < 2) return false;
  const head = rows.find((row) => row.date.slice(0, 10) === end);
  const cur = head?.dividendPerShare;
  if (cur == null || !Number.isFinite(cur) || cur <= 0) return false;
  const piled = roundDividendCash(openSum);
  return piled > 0 && Math.abs(cur - piled) <= 0.02;
}

/**
 * The open first window is the only bar that can swallow pre-history.
 * Drop it when this clamped window did not rewrite it and either a previous
 * pass marked it as listing cash, or the stored amount is the legacy
 * open-window sum (no listing-date stamp required). A fundamentals DPS that
 * does not match that sum is left alone.
 */
export function dropStaleOpenWindowSum<T extends { date: string; dividendPerShare: number | null }>(
  rows: T[],
  listingDatesThisPass: readonly string[],
  previousListingDates: readonly string[],
  events?: ReadonlyArray<{ date: string; amount: number }>,
): { rows: T[]; listingDates: string[] } {
  if (rows.length === 0) return { rows, listingDates: [...previousListingDates] };
  const first = [...rows].sort((a, b) => a.date.localeCompare(b.date))[0]!.date.slice(0, 10);
  const rewritten = new Set(listingDatesThisPass.map((d) => d.slice(0, 10)));
  const previous = new Set(previousListingDates.map((d) => d.slice(0, 10)));
  if (rewritten.has(first)) {
    return { rows, listingDates: [...previous] };
  }
  const legacyPileup = events != null && events.length > 0 && firstBarIsLegacyOpenWindowSum(rows, events);
  if (!previous.has(first) && !legacyPileup) {
    return { rows, listingDates: [...previous] };
  }
  previous.delete(first);
  return {
    rows: rows.map((row) =>
      row.date.slice(0, 10) === first ? { ...row, dividendPerShare: null } : row,
    ),
    listingDates: [...previous],
  };
}

export type DividendFxPlan = "none" | "all" | "unmarked";

/**
 * How to FX quarterly DPS into the quote currency.
 * A non-empty listing-date set is per-row: those amounts are already listing
 * cash and must not be scaled, even when a quarter with no ex-date remains
 * in the reporting currency. The series-level heuristic cannot see that mix.
 */
export function dividendFxPlan(input: {
  listingDates: readonly string[] | null | undefined;
  stampedQuoteCurrency?: string | null;
  quoteCurrency: string;
  points: Array<{ date?: string; dividendPerShare: number | null }>;
  quoteAnnualDividend: number | null | undefined;
  quotePerFinancial: number;
}): DividendFxPlan {
  if ((input.listingDates?.length ?? 0) > 0) return "unmarked";
  if (
    input.stampedQuoteCurrency === input.quoteCurrency ||
    dividendsAlreadyInQuoteCurrency(input.points, input.quoteAnnualDividend, input.quotePerFinancial)
  ) {
    return "none";
  }
  return "all";
}

/** Scale DPS by `rate`, skipping dates already stored as listing-currency cash. */
export function applyDividendFx<T extends { date: string; dividendPerShare: number | null }>(
  rows: T[],
  listingDates: ReadonlySet<string> | null,
  rate: number,
): T[] {
  if (!Number.isFinite(rate) || rate <= 0 || rate === 1) return rows;
  return rows.map((row) => {
    if (listingDates?.has(row.date.slice(0, 10))) return row;
    return { ...row, dividendPerShare: s(row.dividendPerShare, rate) };
  });
}

/**
 * Bucket Yahoo ex-dividend cash into fiscal-quarter windows.
 * Amounts are listing-currency cash. `fill-gaps` only replaces null/0.
 * `overwrite` replaces every quarter Yahoo has in-window cash for.
 * The first window is one quarter long — older events are not dumped into it.
 */
export function overlayQuarterlyDividends<T extends { date: string; dividendPerShare: number | null }>(
  rows: T[],
  events: Array<{ date: string; amount: number }>,
  mode: DividendOverlayMode,
): { rows: T[]; wrote: number; kept: number; listingDates: string[] } {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const dates = sorted.map((row) => row.date.slice(0, 10));
  const firstStart = firstQuarterWindowStart(dates);
  const next: T[] = [];
  let wrote = 0;
  let kept = 0;
  const listingDates: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]!;
    const end = dates[i]!;
    const prevEnd = i > 0 ? dates[i - 1]! : firstStart;
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
      listingDates.push(end);
    } else {
      next.push(row);
      if (cur != null && cur > 0) kept += 1;
    }
  }

  return { rows: next, wrote, kept, listingDates };
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
