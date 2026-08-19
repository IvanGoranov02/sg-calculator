/**
 * Weighted-average share counts are levels, not additive YTD totals.
 * Guard against EDGAR Q4 differencing artifacts (330M − 327M ≈ 3M) and
 * Gemini/Yahoo unit mix (330 vs 330_000_000).
 */

import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

export const SHARE_COUNT_RATIO_MIN = 0.2;
export const SHARE_COUNT_RATIO_MAX = 5;

export function isPlausibleShareCount(
  value: number | null | undefined,
  anchor: number | null | undefined,
): boolean {
  if (value == null || !Number.isFinite(value) || value <= 0) return false;
  if (anchor == null || !Number.isFinite(anchor) || anchor <= 0) return true;
  const ratio = value / anchor;
  return ratio >= SHARE_COUNT_RATIO_MIN && ratio <= SHARE_COUNT_RATIO_MAX;
}

export function medianPositive(values: Array<number | null | undefined>): number | null {
  const xs = values
    .filter((v): v is number => v != null && Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 1 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
}

/** Prefer `preferred` when it is in-range of `fallback`; otherwise use `fallback`. */
export function pickPlausibleShareCount(
  preferred: number | null | undefined,
  fallback: number | null | undefined,
): number | undefined {
  if (isPlausibleShareCount(preferred, fallback)) return preferred as number;
  if (fallback != null && Number.isFinite(fallback) && fallback > 0) return fallback;
  if (preferred != null && Number.isFinite(preferred) && preferred > 0) return preferred;
  return undefined;
}

function fyForQuarterDate(
  dateIso: string,
  annuals: Array<{ date: string; fiscalYear: string }>,
): string | null {
  const d = dateIso.slice(0, 10);
  for (let i = 0; i < annuals.length; i++) {
    const end = annuals[i]!.date.slice(0, 10);
    const start = i > 0 ? annuals[i - 1]!.date.slice(0, 10) : "0000-01-01";
    if (d > start && d <= end) return annuals[i]!.fiscalYear;
  }
  return null;
}

/** Replace missing or implausible quarterly WASO with the matching annual (or series median). */
export function sanitizeBundleDilutedShares(bundle: StockAnalysisBundle): void {
  const annuals = [...bundle.income]
    .filter((r) => r.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const annualByFy = new Map<string, number>();
  for (const row of bundle.income) {
    const n = row.dilutedAverageShares;
    if (n != null && Number.isFinite(n) && n > 0) annualByFy.set(row.fiscalYear, n);
  }
  const seriesAnchor =
    medianPositive(bundle.incomeQuarterly.map((r) => r.dilutedAverageShares)) ??
    medianPositive([...annualByFy.values()]);

  bundle.incomeQuarterly = bundle.incomeQuarterly.map((row) => {
    const fy = fyForQuarterDate(row.date, annuals);
    const annual = fy ? annualByFy.get(fy) : undefined;
    const anchor = annual ?? seriesAnchor;
    const next = pickPlausibleShareCount(row.dilutedAverageShares, anchor);
    if (next === row.dilutedAverageShares) return row;
    return { ...row, dilutedAverageShares: next };
  });
}
