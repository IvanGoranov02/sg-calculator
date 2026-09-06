/** Multi-horizon growth percentages for chart pill badges (1Y / 2Y / 5Y / 10Y). */

export type GrowthPills = {
  oneYear: number | null;
  twoYear: number | null;
  fiveYear: number | null;
  tenYear: number | null;
};

const EMPTY_PILLS: GrowthPills = {
  oneYear: null,
  twoYear: null,
  fiveYear: null,
  tenYear: null,
};

function cagr(start: number, endVal: number, years: number): number | null {
  if (start <= 0 || endVal < 0 || !Number.isFinite(start) || !Number.isFinite(endVal) || years <= 0) {
    return null;
  }
  return (Math.pow(endVal / start, 1 / years) - 1) * 100;
}

/**
 * Compares the latest finite value to 1/2/5/10 years earlier.
 * `periodsPerYear` is 1 for annual rows, 4 for quarterly rows, ~252 for daily price bars.
 */
export function computeGrowthPills(values: (number | null)[], periodsPerYear: number): GrowthPills {
  if (!Number.isFinite(periodsPerYear) || periodsPerYear <= 0) return EMPTY_PILLS;

  let last = -1;
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v != null && Number.isFinite(v)) {
      last = i;
      break;
    }
  }
  if (last < 0) return EMPTY_PILLS;

  const end = values[last] as number;

  function startVal(periodsBack: number): number | null {
    const idx = last - periodsBack;
    if (idx < 0) return null;
    const v = values[idx];
    if (v == null || !Number.isFinite(v)) return null;
    return v;
  }

  const oneYearBack = periodsPerYear;
  const oneYear = (() => {
    const s = startVal(oneYearBack);
    if (s == null || s === 0) return null;
    return ((end - s) / Math.abs(s)) * 100;
  })();

  const twoYear = (() => {
    const s = startVal(2 * periodsPerYear);
    return s != null && s > 0 && end >= 0 ? cagr(s, end, 2) : null;
  })();

  const fiveYear = (() => {
    const s = startVal(5 * periodsPerYear);
    return s != null && s > 0 && end >= 0 ? cagr(s, end, 5) : null;
  })();

  const tenYear = (() => {
    const s = startVal(10 * periodsPerYear);
    return s != null && s > 0 && end >= 0 ? cagr(s, end, 10) : null;
  })();

  return { oneYear, twoYear, fiveYear, tenYear };
}

export function extractSeriesValues(
  rows: Record<string, unknown>[],
  key: string,
): (number | null)[] {
  return rows.map((row) => {
    const v = row[key];
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  });
}

export function growthPillsForKey(
  rows: Record<string, unknown>[],
  key: string,
  freq: "annual" | "quarterly",
): GrowthPills {
  return computeGrowthPills(extractSeriesValues(rows, key), freq === "annual" ? 1 : 4);
}

export type GrowthPillsEntry = {
  label?: string;
  pills: GrowthPills;
};

export function growthPillsEntries(
  rows: Record<string, unknown>[],
  keys: { key: string; label?: string }[],
  freq: "annual" | "quarterly",
): GrowthPillsEntry[] {
  return keys.map(({ key, label }) => ({
    label,
    pills: growthPillsForKey(rows, key, freq),
  }));
}
