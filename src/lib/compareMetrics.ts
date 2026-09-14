/**
 * Side-by-side compare metrics, ranking, and category leads.
 * Pure helpers so the Compare UI stays presentational and unit-testable.
 */

import {
  formatCurrencyCompact,
  formatDecimalAsPercent,
  formatPercent,
  formatRatio,
  normalizeYahooDividendYieldToDecimal,
} from "@/lib/format";
import type { InvestorMetrics } from "@/lib/stockAnalysisTypes";
import type { CompareRow } from "@/lib/yahooCompare";

/** Head-to-head only — AlphaSpread-style compare is two companies. */
export const MAX_COMPARE = 2;

export const DEFAULT_COMPARE_SYMBOLS = ["AAPL", "MSFT"] as const;

/** Slot 0 emerald, slot 1 sky — matches other StockGauge charts. */
export const COMPARE_SLOT_HEX = ["#10b981", "#38bdf8"] as const;

export function parseCompareSymbols(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (raw ?? "").split(",")) {
    const s = part.trim().toUpperCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= MAX_COMPARE) break;
  }
  return out;
}

export function initialCompareSymbols(raw: string | null | undefined): string[] {
  const parsed = parseCompareSymbols(raw);
  return parsed.length > 0 ? parsed : [...DEFAULT_COMPARE_SYMBOLS];
}

export type CompareBetter = "high" | "low" | "none";

export type CompareGroup = "valuation" | "profitability" | "growth" | "balance" | "income" | "market";

export type CompareMetricDef = {
  key: string;
  labelKey: string;
  group: CompareGroup;
  get: (row: CompareRow) => number | null;
  fmt: (v: number) => string;
  better: CompareBetter;
};

export const COMPARE_GROUPS: CompareGroup[] = [
  "valuation",
  "profitability",
  "growth",
  "balance",
  "income",
  "market",
];

/** Groups used for the "at a glance" scoreboard (need a clear better-direction). */
export const COMPARE_LEAD_GROUPS: CompareGroup[] = ["valuation", "profitability", "growth", "balance"];

function finite(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? n : null;
}

function inv(row: CompareRow): InvestorMetrics {
  return row.investor;
}

function debtEquityRatio(row: CompareRow): number | null {
  const raw = inv(row).debtToEquity;
  // Yahoo reports debt/equity as a percentage (e.g. 150.5 = 1.5x).
  return finite(raw) != null ? (raw as number) / 100 : null;
}

function payoutDecimal(row: CompareRow): number | null {
  const n = inv(row).payoutRatio;
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  return n > 1 ? n / 100 : n;
}

export function weekRangePosition(row: CompareRow): number | null {
  const lo = inv(row).fiftyTwoWeekLow;
  const hi = inv(row).fiftyTwoWeekHigh;
  const p = row.price;
  if (lo == null || hi == null || !Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo) || !Number.isFinite(p)) {
    return null;
  }
  return (p - lo) / (hi - lo);
}

export function analystUpside(row: CompareRow): number | null {
  const target = inv(row).targetMeanPrice;
  if (target == null || !Number.isFinite(target) || !(target > 0) || !(row.price > 0)) return null;
  return (target - row.price) / row.price;
}

const pct1 = (v: number) => formatDecimalAsPercent(v, 1);

export const COMPARE_METRICS: CompareMetricDef[] = [
  {
    key: "marketCap",
    labelKey: "compare.marketCap",
    group: "valuation",
    get: (r) => finite(inv(r).marketCap),
    fmt: formatCurrencyCompact,
    better: "none",
  },
  {
    key: "trailingPE",
    labelKey: "compare.trailingPE",
    group: "valuation",
    get: (r) => finite(inv(r).trailingPE),
    fmt: formatRatio,
    better: "low",
  },
  {
    key: "forwardPE",
    labelKey: "compare.forwardPE",
    group: "valuation",
    get: (r) => finite(inv(r).forwardPE),
    fmt: formatRatio,
    better: "low",
  },
  {
    key: "pegRatio",
    labelKey: "compare.peg",
    group: "valuation",
    get: (r) => finite(inv(r).pegRatio),
    fmt: formatRatio,
    better: "low",
  },
  {
    key: "priceToSales",
    labelKey: "compare.ps",
    group: "valuation",
    get: (r) => finite(inv(r).priceToSales),
    fmt: formatRatio,
    better: "low",
  },
  {
    key: "priceToBook",
    labelKey: "compare.pb",
    group: "valuation",
    get: (r) => finite(inv(r).priceToBook),
    fmt: formatRatio,
    better: "low",
  },
  {
    key: "evRevenue",
    labelKey: "compare.evRevenue",
    group: "valuation",
    get: (r) => finite(inv(r).enterpriseToRevenue),
    fmt: formatRatio,
    better: "low",
  },
  {
    key: "evEbitda",
    labelKey: "compare.evEbitda",
    group: "valuation",
    get: (r) => finite(inv(r).enterpriseToEbitda),
    fmt: formatRatio,
    better: "low",
  },
  {
    key: "grossMargins",
    labelKey: "compare.grossMargin",
    group: "profitability",
    get: (r) => finite(inv(r).grossMargins),
    fmt: pct1,
    better: "high",
  },
  {
    key: "operatingMargins",
    labelKey: "compare.opMargin",
    group: "profitability",
    get: (r) => finite(inv(r).operatingMargins),
    fmt: pct1,
    better: "high",
  },
  {
    key: "profitMargins",
    labelKey: "compare.netMargin",
    group: "profitability",
    get: (r) => finite(inv(r).profitMargins),
    fmt: pct1,
    better: "high",
  },
  {
    key: "returnOnEquity",
    labelKey: "compare.roe",
    group: "profitability",
    get: (r) => finite(inv(r).returnOnEquity),
    fmt: pct1,
    better: "high",
  },
  {
    key: "returnOnAssets",
    labelKey: "compare.roa",
    group: "profitability",
    get: (r) => finite(inv(r).returnOnAssets),
    fmt: pct1,
    better: "high",
  },
  {
    key: "revenueGrowth",
    labelKey: "compare.revGrowth",
    group: "growth",
    get: (r) => finite(inv(r).revenueGrowth),
    fmt: pct1,
    better: "high",
  },
  {
    key: "earningsGrowth",
    labelKey: "compare.earnGrowth",
    group: "growth",
    get: (r) => finite(inv(r).earningsGrowth),
    fmt: pct1,
    better: "high",
  },
  {
    key: "debtToEquity",
    labelKey: "compare.debtEquity",
    group: "balance",
    get: debtEquityRatio,
    fmt: formatRatio,
    better: "low",
  },
  {
    key: "currentRatio",
    labelKey: "compare.currentRatio",
    group: "balance",
    get: (r) => finite(inv(r).currentRatio),
    fmt: formatRatio,
    better: "high",
  },
  {
    key: "quickRatio",
    labelKey: "compare.quickRatio",
    group: "balance",
    get: (r) => finite(inv(r).quickRatio),
    fmt: formatRatio,
    better: "high",
  },
  {
    key: "totalCash",
    labelKey: "compare.totalCash",
    group: "balance",
    get: (r) => finite(inv(r).totalCash),
    fmt: formatCurrencyCompact,
    better: "none",
  },
  {
    key: "totalDebt",
    labelKey: "compare.totalDebt",
    group: "balance",
    get: (r) => finite(inv(r).totalDebt),
    fmt: formatCurrencyCompact,
    better: "none",
  },
  {
    key: "dividendYield",
    labelKey: "compare.divYield",
    group: "income",
    get: (r) => normalizeYahooDividendYieldToDecimal(inv(r).dividendYield),
    fmt: pct1,
    better: "high",
  },
  {
    key: "payout",
    labelKey: "compare.payout",
    group: "income",
    get: payoutDecimal,
    fmt: pct1,
    better: "none",
  },
  {
    key: "epsTrailing",
    labelKey: "compare.epsTrailing",
    group: "income",
    get: (r) => finite(inv(r).trailingEps),
    fmt: (v) => formatRatio(v, 2),
    better: "none",
  },
  {
    key: "analystUpside",
    labelKey: "compare.analystUpside",
    group: "income",
    get: analystUpside,
    fmt: (v) => formatDecimalAsPercent(v, 1),
    better: "high",
  },
  {
    key: "weekChange",
    labelKey: "compare.weekChange",
    group: "market",
    get: (r) => finite(r.weekChangePercent),
    fmt: (v) => formatPercent(v, 1),
    better: "high",
  },
  {
    key: "weekPosition",
    labelKey: "compare.weekPosition",
    group: "market",
    get: weekRangePosition,
    fmt: (v) => `${(v * 100).toFixed(0)}%`,
    better: "none",
  },
  {
    key: "beta",
    labelKey: "compare.beta",
    group: "market",
    get: (r) => finite(inv(r).beta),
    fmt: (v) => v.toFixed(2),
    better: "none",
  },
];

/** Index of the best column for a metric row, or -1 (ties / not enough data). */
export function bestIndex(values: (number | null)[], dir: CompareBetter): number {
  if (dir === "none") return -1;
  const present = values.map((v, i) => ({ v, i })).filter((x) => x.v != null && Number.isFinite(x.v));
  if (present.length < 2) return -1;
  const sorted = [...present].sort((a, b) =>
    dir === "low" ? (a.v as number) - (b.v as number) : (b.v as number) - (a.v as number),
  );
  // Skip non-positive ratios for "low is better" (a negative P/E isn't "cheap").
  const top = dir === "low" ? sorted.find((x) => (x.v as number) > 0) ?? sorted[0] : sorted[0];
  const tie = present.filter((x) => x.v === top.v).length > 1;
  return tie ? -1 : top.i;
}

/** Bar width 0–100 from |value| vs the row max, so cells are scannable. */
export function relativeBarPct(values: (number | null)[], value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const max = Math.max(
    0,
    ...values.filter((x): x is number => x != null && Number.isFinite(x)).map((x) => Math.abs(x)),
  );
  if (!(max > 0)) return null;
  return (Math.abs(value) / max) * 100;
}

function metricRanks(values: (number | null)[], dir: CompareBetter): (number | null)[] {
  if (dir === "none") return values.map(() => null);
  const present = values
    .map((v, i) => ({ v, i }))
    .filter((x) => x.v != null && Number.isFinite(x.v))
    .map((x) => ({
      i: x.i,
      v: dir === "low" && (x.v as number) <= 0 ? Number.POSITIVE_INFINITY : (x.v as number),
    }));
  if (present.length < 2) return values.map(() => null);
  const sorted = [...present].sort((a, b) => (dir === "low" ? a.v - b.v : b.v - a.v));
  const ranks: (number | null)[] = values.map(() => null);
  let rank = 1;
  for (let k = 0; k < sorted.length; k++) {
    if (k > 0 && sorted[k].v !== sorted[k - 1].v) rank = k + 1;
    ranks[sorted[k].i] = rank;
  }
  return ranks;
}

/**
 * Stock with the best average rank in a group, or -1 when tied / not enough data.
 */
export function categoryLeaderIndex(rows: CompareRow[], group: CompareGroup): number {
  if (rows.length < 2) return -1;
  const metrics = COMPARE_METRICS.filter((m) => m.group === group && m.better !== "none");
  const sums = rows.map(() => 0);
  const counts = rows.map(() => 0);

  for (const m of metrics) {
    const vals = rows.map((r) => m.get(r));
    const ranks = metricRanks(vals, m.better);
    ranks.forEach((rank, i) => {
      if (rank == null) return;
      sums[i] += rank;
      counts[i] += 1;
    });
  }

  const avgs = sums.map((s, i) => (counts[i] > 0 ? s / counts[i] : null));
  const scored = avgs
    .map((avg, i) => ({ avg, i }))
    .filter((x): x is { avg: number; i: number } => x.avg != null);
  if (scored.length < 2) return -1;
  scored.sort((a, b) => a.avg - b.avg);
  if (scored[0].avg === scored[1].avg) return -1;
  return scored[0].i;
}

export function visibleMetricsForGroup(rows: CompareRow[], group: CompareGroup): CompareMetricDef[] {
  return COMPARE_METRICS.filter((m) => m.group === group).filter((m) =>
    rows.some((r) => {
      const v = m.get(r);
      return v != null && Number.isFinite(v);
    }),
  );
}

export type CompareBarPoint = {
  key: string;
  labelKey: string;
  values: (number | null)[];
  labels: string[];
  pcts: (number | null)[];
  best: number;
};

export function buildGroupBarPoints(rows: CompareRow[], group: CompareGroup): CompareBarPoint[] {
  return visibleMetricsForGroup(rows, group).map((m) => {
    const values = rows.map((r) => m.get(r));
    return {
      key: m.key,
      labelKey: m.labelKey,
      values,
      labels: values.map((v) => (v != null && Number.isFinite(v) ? m.fmt(v) : "—")),
      pcts: values.map((v) => relativeBarPct(values, v)),
      best: bestIndex(values, m.better),
    };
  });
}

/** Percent-scale metrics for the grouped overview chart (Yahoo stores most as decimals). */
export const COMPARE_PERCENT_CHART_KEYS = [
  "grossMargins",
  "operatingMargins",
  "profitMargins",
  "returnOnEquity",
  "returnOnAssets",
  "revenueGrowth",
  "earningsGrowth",
  "dividendYield",
] as const;

export const COMPARE_RATIO_CHART_KEYS = [
  "trailingPE",
  "forwardPE",
  "pegRatio",
  "priceToSales",
  "priceToBook",
  "evEbitda",
] as const;

export type OverviewBarRow = {
  key: string;
  labelKey: string;
  a: number | null;
  b: number | null;
};

export function buildOverviewBarRows(
  rows: CompareRow[],
  keys: readonly string[],
  scale: "percent" | "raw",
): OverviewBarRow[] {
  const out: OverviewBarRow[] = [];
  for (const key of keys) {
    const m = COMPARE_METRICS.find((d) => d.key === key);
    if (!m) continue;
    const vals = rows.map((r) => m.get(r));
    if (!vals.some((v) => v != null && Number.isFinite(v))) continue;
    const axis = (v: number | null): number | null => {
      if (v == null || !Number.isFinite(v)) return null;
      return scale === "percent" ? v * 100 : v;
    };
    out.push({
      key: m.key,
      labelKey: m.labelKey,
      a: axis(vals[0] ?? null),
      b: axis(vals[1] ?? null),
    });
  }
  return out;
}

/** Winner of 52-week return when both sides have data and they differ. */
export function twelveMonthLead(rows: CompareRow[]): { winner: number; loser: number } | null {
  if (rows.length < 2) return null;
  const a = rows[0].weekChangePercent;
  const b = rows[1].weekChangePercent;
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
  return a > b ? { winner: 0, loser: 1 } : { winner: 1, loser: 0 };
}
