/**
 * "Verified" fundamentals: statements taken straight from SEC filings (no AI anywhere),
 * accepted only when they pass arithmetic checks AND agree with an independent second
 * source (Yahoo) on the periods both cover. Pure functions: no network, no DB.
 */

import { bundleFromCompanyFacts, type EdgarCompanyFacts } from "@/lib/edgar/normalize";
import { trimBundleToFundamentalsWindow } from "@/lib/fundamentalsHistoryLimits";
import { sanitizeBundleDilutedShares } from "@/lib/shareCountSanity";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import type { YahooFundamentalsPayload } from "@/lib/yahooFundamentalsMerge";

export type VerifiedStatements = Pick<
  StockAnalysisBundle,
  "income" | "cashFlow" | "balanceSheet" | "incomeQuarterly" | "cashFlowQuarterly" | "balanceSheetQuarterly"
> & {
  name: string;
  /** Reporting currency of the filings. */
  currency: string;
};

export type VerifyIssue = { code: string; message: string };

export type VerifyReport = {
  ok: boolean;
  /** Blocking problems; any of these means the data is NOT stored as verified. */
  errors: VerifyIssue[];
  /** Number of individual figures compared against the second source. */
  crossChecked: number;
  /** Number of internal arithmetic checks that ran. */
  internalChecks: number;
};

export const MIN_ANNUAL_YEARS = 4;
export const MIN_QUARTERS = 16;
/** Sum of four quarters vs the filed fiscal year. */
const SUM_TOLERANCE = 0.01;
/** SEC filing vs Yahoo for the same period. */
const CROSS_TOLERANCE = 0.02;
const DAY_MS = 86_400_000;

function days(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / DAY_MS);
}

/** Relative agreement, with an absolute floor (`scale`) so near-zero figures do not fail on noise. */
function agrees(a: number, b: number, tol: number, scale = 0): boolean {
  const diff = Math.abs(a - b);
  if (diff <= Math.abs(scale) * 0.003) return true;
  const base = Math.max(Math.abs(a), Math.abs(b));
  return base === 0 ? true : diff / base <= tol;
}

/** Statements for the last 5 fiscal years / 20 quarters, or null when filings are too thin. */
export function buildStatementsFromFacts(symbol: string, facts: EdgarCompanyFacts): VerifiedStatements | null {
  const bundle = bundleFromCompanyFacts(symbol, facts);
  if (!bundle) return null;
  sanitizeBundleDilutedShares(bundle);
  trimBundleToFundamentalsWindow(bundle);
  return {
    name: bundle.quote.name,
    currency: bundle.investor.currency,
    income: bundle.income,
    cashFlow: bundle.cashFlow,
    balanceSheet: bundle.balanceSheet,
    incomeQuarterly: bundle.incomeQuarterly,
    cashFlowQuarterly: bundle.cashFlowQuarterly,
    balanceSheetQuarterly: bundle.balanceSheetQuarterly,
  };
}

export function latestQuarterEnd(s: VerifiedStatements): string | null {
  return s.incomeQuarterly.length ? s.incomeQuarterly[s.incomeQuarterly.length - 1].date.slice(0, 10) : null;
}

function nearest<T extends { date: Date }>(rows: T[], dateIso: string, maxDays: number): T | null {
  let best: T | null = null;
  let bestGap = Infinity;
  for (const r of rows) {
    const d = r.date instanceof Date ? r.date : new Date(r.date as unknown as string);
    if (Number.isNaN(d.getTime())) continue;
    const gap = Math.abs(days(d.toISOString(), dateIso));
    if (gap <= maxDays && gap < bestGap) {
      best = r;
      bestGap = gap;
    }
  }
  return best;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export type VerifyOptions = {
  /** Only cross-check periods ending after this date (used when appending a new quarter). */
  sinceExclusive?: string | null;
};

export function verifyStatements(
  s: VerifiedStatements,
  yahoo: YahooFundamentalsPayload | null,
  opts?: VerifyOptions,
): VerifyReport {
  const errors: VerifyIssue[] = [];
  let internalChecks = 0;
  let crossChecked = 0;
  const since = opts?.sinceExclusive ?? null;
  const inScope = (date: string) => !since || date.slice(0, 10) > since;
  const err = (code: string, message: string) => errors.push({ code, message });

  // 1. Coverage.
  internalChecks += 2;
  if (s.income.length < MIN_ANNUAL_YEARS) {
    err("coverage_annual", `Only ${s.income.length} fiscal years in filings (need ${MIN_ANNUAL_YEARS}).`);
  }
  if (s.incomeQuarterly.length < MIN_QUARTERS) {
    err("coverage_quarterly", `Only ${s.incomeQuarterly.length} quarters in filings (need ${MIN_QUARTERS}).`);
  }

  // 2. No holes in the quarterly series.
  for (let i = 1; i < s.incomeQuarterly.length; i++) {
    const gap = days(s.incomeQuarterly[i - 1].date, s.incomeQuarterly[i].date);
    internalChecks++;
    if (gap < 75 || gap > 125) {
      err("quarter_gap", `Quarter missing between ${s.incomeQuarterly[i - 1].date} and ${s.incomeQuarterly[i].date}.`);
    }
  }

  // 3. Core lines present and sane.
  for (const r of s.income) {
    internalChecks++;
    if (!(r.revenue > 0)) err("annual_revenue", `FY${r.fiscalYear}: revenue missing in filings.`);
    else if (r.netIncome === 0) err("annual_net_income", `FY${r.fiscalYear}: net income missing in filings.`);
    else if (r.grossProfit !== 0 && r.grossProfit > r.revenue * 1.001) {
      err("annual_gross", `FY${r.fiscalYear}: gross profit exceeds revenue.`);
    }
  }
  for (const q of s.incomeQuarterly) {
    internalChecks++;
    if (!(q.revenue > 0)) err("quarter_revenue", `${q.date}: quarterly revenue missing in filings.`);
  }

  // 4. Four quarters must add up to the filed fiscal year.
  for (const fy of s.income) {
    const inYear = (date: string) => {
      const d = days(date, fy.date);
      return d >= -3 && d < 360;
    };
    const qs = s.incomeQuarterly.filter((q) => inYear(q.date));
    if (qs.length !== 4) continue;
    internalChecks += 2;
    const rev = qs.reduce((a, q) => a + q.revenue, 0);
    const ni = qs.reduce((a, q) => a + q.netIncome, 0);
    if (!agrees(rev, fy.revenue, SUM_TOLERANCE)) {
      err("sum_revenue", `FY${fy.fiscalYear}: quarters sum to ${rev} but the annual report says ${fy.revenue}.`);
    }
    if (!agrees(ni, fy.netIncome, SUM_TOLERANCE, fy.revenue)) {
      err("sum_net_income", `FY${fy.fiscalYear}: quarterly net income sums to ${ni}, annual report says ${fy.netIncome}.`);
    }
    const cfA = s.cashFlow.find((c) => c.fiscalYear === fy.fiscalYear);
    const cfQ = s.cashFlowQuarterly.filter((q) => inYear(q.date));
    if (cfA?.operatingCashFlow != null && cfQ.length === 4 && cfQ.every((q) => q.operatingCashFlow != null)) {
      internalChecks++;
      const ocf = cfQ.reduce((a, q) => a + (q.operatingCashFlow ?? 0), 0);
      if (!agrees(ocf, cfA.operatingCashFlow, SUM_TOLERANCE, fy.revenue)) {
        err("sum_ocf", `FY${fy.fiscalYear}: quarterly operating cash flow sums to ${ocf}, annual says ${cfA.operatingCashFlow}.`);
      }
    }
  }

  // 5. Independent second source.
  if (!yahoo) {
    err("second_source_unavailable", "Second source (Yahoo) did not answer, so the figures could not be cross-checked.");
    return { ok: false, errors, crossChecked, internalChecks };
  }
  let annualPairs = 0;
  let quarterPairs = 0;
  const cross = (label: string, ours: number | null | undefined, theirs: unknown, scale: number): boolean => {
    const a = num(ours);
    const b = num(theirs);
    if (a == null || b == null) return false;
    crossChecked++;
    if (!agrees(a, b, CROSS_TOLERANCE, scale)) {
      err("cross_mismatch", `${label}: filing says ${a}, second source says ${b}.`);
    }
    return true;
  };
  for (const fy of s.income) {
    if (!inScope(fy.date)) continue;
    const y = nearest(yahoo.finA, fy.date, 10);
    if (y) {
      const a = cross(`FY${fy.fiscalYear} revenue`, fy.revenue, y.totalRevenue, fy.revenue);
      const b = cross(`FY${fy.fiscalYear} net income`, fy.netIncome, y.netIncome, fy.revenue);
      if (a && b) annualPairs++;
    }
    const cf = s.cashFlow.find((c) => c.fiscalYear === fy.fiscalYear);
    const yc = nearest(yahoo.cfA, fy.date, 10);
    if (cf && yc) cross(`FY${fy.fiscalYear} operating cash flow`, cf.operatingCashFlow, yc.operatingCashFlow, fy.revenue);
    const bs = s.balanceSheet.find((c) => c.fiscalYear === fy.fiscalYear);
    const yb = nearest(yahoo.bsA, fy.date, 10);
    if (bs && yb) cross(`FY${fy.fiscalYear} total assets`, bs.totalAssets, yb.totalAssets, 0);
  }
  for (const q of s.incomeQuarterly) {
    if (!inScope(q.date)) continue;
    const y = nearest(yahoo.finQ, q.date, 10);
    if (y) {
      const a = cross(`${q.date} revenue`, q.revenue, y.totalRevenue, q.revenue);
      const b = cross(`${q.date} net income`, q.netIncome, y.netIncome, q.revenue);
      if (a && b) quarterPairs++;
    }
    const cf = s.cashFlowQuarterly.find((c) => c.date.slice(0, 10) === q.date.slice(0, 10));
    const yc = nearest(yahoo.cfQ, q.date, 10);
    if (cf && yc) cross(`${q.date} operating cash flow`, cf.operatingCashFlow, yc.operatingCashFlow, q.revenue);
  }
  if (since) {
    if (quarterPairs < 1) err("second_source_thin", "Second source does not cover the new quarter yet.");
  } else if (annualPairs < 2 || quarterPairs < 2) {
    err("second_source_thin", `Second source overlaps on only ${annualPairs} years / ${quarterPairs} quarters.`);
  }

  return { ok: errors.length === 0, errors, crossChecked, internalChecks };
}
