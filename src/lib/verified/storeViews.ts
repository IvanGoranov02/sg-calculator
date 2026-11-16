/**
 * Figures other pages (Compare, DCF) take from the permanent store, so they show the same
 * numbers as the stock page. Pure functions over stored rows.
 */

import { storeCoverage, type PeriodRow } from "@/lib/verified/periods";

export type StoreTtmMetrics = {
  /** Fractions like Yahoo reports them (0.25 = 25%). */
  grossMargins: number | null;
  operatingMargins: number | null;
  profitMargins: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  /** Latest quarter against the same quarter a year earlier. */
  revenueGrowth: number | null;
  earningsGrowth: number | null;
};

const ratio = (a: number | null | undefined, b: number | null | undefined): number | null =>
  a != null && b != null && Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : null;

/**
 * Trailing-twelve-month ratios from the last four stored quarters, or null when the store
 * does not hold an unbroken year (plus the year-ago quarter for growth).
 */
export function ttmMetricsFromRows(rows: PeriodRow[]): StoreTtmMetrics | null {
  const cov = storeCoverage(rows);
  if (cov.contiguousQuarters < 4) return null;
  const quarters = rows.filter((r) => r.kind === "Q").sort((a, b) => a.end.localeCompare(b.end));
  const last4 = quarters.slice(-4);
  const bank = last4.some((q) => q.data.bank != null);
  const sum = (pick: (r: PeriodRow) => number | null | undefined): number | null => {
    let total = 0;
    for (const q of last4) {
      const v = pick(q);
      if (v == null || !Number.isFinite(v)) return null;
      total += v;
    }
    return total;
  };
  const revenue = sum((q) => q.data.inc.revenue);
  const netIncome = sum((q) => q.data.inc.netIncome);
  if (!revenue || netIncome == null) return null;
  // Zero means "not reported" for gross profit; a bank has none at all.
  const gross = bank ? null : sum((q) => q.data.inc.grossProfit || null);
  const operating = bank ? null : sum((q) => q.data.inc.operatingIncome);
  const latest = last4[3];
  const yearAgo = cov.contiguousQuarters >= 5 ? quarters[quarters.length - 5] : null;
  const growth = (now: number, then: number | undefined) => (then != null && then > 0 ? (now - then) / then : null);
  return {
    grossMargins: ratio(gross, revenue),
    operatingMargins: ratio(operating, revenue),
    profitMargins: ratio(netIncome, revenue),
    returnOnEquity: ratio(netIncome, latest.data.bs?.stockholdersEquity),
    returnOnAssets: ratio(netIncome, latest.data.bs?.totalAssets),
    revenueGrowth: yearAgo ? growth(latest.data.inc.revenue, yearAgo.data.inc.revenue) : null,
    earningsGrowth: yearAgo ? growth(latest.data.inc.netIncome, yearAgo.data.inc.netIncome) : null,
  };
}

export type StoreLatestAnnual = {
  end: string;
  revenue: number;
  operatingMarginPct: number | null;
  netIncome: number;
  ebitda: number | null;
  freeCashFlow: number | null;
  isBank: boolean;
};

/** The newest stored fiscal year, in the shape the DCF seed needs. */
export function latestAnnualFromRows(rows: PeriodRow[]): StoreLatestAnnual | null {
  const annual = rows.filter((r) => r.kind === "A" && r.trust !== "disputed").sort((a, b) => a.end.localeCompare(b.end));
  const last = annual[annual.length - 1];
  if (!last || !(last.data.inc.revenue > 0)) return null;
  const { inc, cf } = last.data;
  return {
    end: last.end,
    revenue: inc.revenue,
    operatingMarginPct: inc.operatingIncome != null ? (inc.operatingIncome / inc.revenue) * 100 : null,
    netIncome: inc.netIncome,
    ebitda: inc.ebitda ?? null,
    freeCashFlow: cf && cf.operatingCashFlow != null ? cf.freeCashFlow : null,
    isBank: last.data.bank != null,
  };
}
