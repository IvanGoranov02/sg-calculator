import type { DividendQuarterlyPoint } from "@/lib/stockAnalysisTypes";
import { sortQuarterlyByDateAsc } from "@/lib/stockAnalysisTypes";

/** Gemini base bundle is 5y; Yahoo merge may add more, so 10y shows available rows when present. */
export type ChartTimeRange = "10y" | "5y" | "3y" | "1y" | "custom";

export type FundamentalsFreq = "annual" | "quarterly";

function fiscalYearFromRow(r: { fiscalYear: string; date: string }): number {
  const fy = parseInt(r.fiscalYear, 10);
  if (Number.isFinite(fy)) return fy;
  return new Date(r.date).getUTCFullYear();
}

export function annualDataYearBounds<T extends { fiscalYear: string; date: string }>(rows: T[]): {
  min: number;
  max: number;
} | null {
  let min = Infinity;
  let max = -Infinity;
  for (const r of rows) {
    const y = fiscalYearFromRow(r);
    if (!Number.isFinite(y)) continue;
    min = Math.min(min, y);
    max = Math.max(max, y);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

export function maxAnnualFiscalYearFromBundle(bundle: {
  income: { fiscalYear: string; date: string }[];
  cashFlow: { fiscalYear: string; date: string }[];
  balanceSheet: { fiscalYear: string; date: string }[];
}): number | null {
  let maxY = -Infinity;
  for (const arr of [bundle.income, bundle.cashFlow, bundle.balanceSheet]) {
    for (const r of arr) {
      const y = fiscalYearFromRow(r);
      if (Number.isFinite(y)) maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(maxY) || maxY === -Infinity) return null;
  return maxY;
}

function fiscalYearStringRangeInclusive(a: number, b: number): string[] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const out: string[] = [];
  for (let y = lo; y <= hi; y++) out.push(String(y));
  return out;
}

export function annualDisplayFiscalYears(
  bundle: {
    income: { fiscalYear: string; date: string }[];
    cashFlow: { fiscalYear: string; date: string }[];
    balanceSheet: { fiscalYear: string; date: string }[];
  },
  timeRange: ChartTimeRange,
  customFromYear: number | null,
  customToYear: number | null,
): string[] {
  const incomeSorted = [...bundle.income].sort((x, y) => fiscalYearFromRow(x) - fiscalYearFromRow(y));

  if (timeRange === "custom") {
    const bounds = annualDataYearBounds(incomeSorted);
    const lo = customFromYear ?? bounds?.min ?? new Date().getUTCFullYear() - 5;
    const hi = customToYear ?? bounds?.max ?? new Date().getUTCFullYear();
    return fiscalYearStringRangeInclusive(lo, hi);
  }

  const n = { "1y": 1, "3y": 3, "5y": 5, "10y": 10 }[timeRange];
  const end = maxAnnualFiscalYearFromBundle(bundle) ?? new Date().getUTCFullYear();
  const start = end - n + 1;
  return fiscalYearStringRangeInclusive(start, end);
}

export function quarterlyDataYearBounds(dates: string[]): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const d of dates) {
    const y = new Date(`${d.slice(0, 10)}T12:00:00Z`).getUTCFullYear();
    if (!Number.isFinite(y)) continue;
    min = Math.min(min, y);
    max = Math.max(max, y);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

export function quarterlyFilterYearBounds(bundle: {
  incomeQuarterly: { date: string }[];
  dividendQuarterly: { date: string }[];
}): { min: number; max: number } | null {
  const dates: string[] = [];
  for (const r of bundle.incomeQuarterly) dates.push(r.date.slice(0, 10));
  for (const r of bundle.dividendQuarterly) dates.push(r.date.slice(0, 10));
  return quarterlyDataYearBounds(dates);
}

const PRESET_QUARTER_COUNT: Record<Exclude<ChartTimeRange, "custom">, number> = {
  "1y": 4,
  "3y": 12,
  "5y": 20,
  "10y": 40,
};

export function filterQuarterlyChartRowsByPeriod<T extends { periodEnd?: string }>(
  rows: T[],
  timeRange: ChartTimeRange,
  customFromYear: number | null,
  customToYear: number | null,
  quarterBounds: { min: number; max: number },
): T[] {
  const withPe = rows.filter((r) => typeof r.periodEnd === "string" && r.periodEnd.length >= 10);
  if (withPe.length === 0) return [];
  const sorted = [...withPe].sort((a, b) =>
    (a.periodEnd as string).slice(0, 10).localeCompare((b.periodEnd as string).slice(0, 10)),
  );

  if (timeRange === "custom") {
    return sorted.filter((r) =>
      quarterlyPeriodEndInRange(
        (r.periodEnd as string).slice(0, 10),
        timeRange,
        customFromYear,
        customToYear,
        quarterBounds.min,
        quarterBounds.max,
      ),
    );
  }

  const take = PRESET_QUARTER_COUNT[timeRange];
  return sorted.slice(-Math.min(take, sorted.length));
}

export function quarterlyPeriodEndInRange(
  dateIso: string,
  timeRange: ChartTimeRange,
  customFromYear: number | null,
  customToYear: number | null,
  dataYearMin: number,
  dataYearMax: number,
): boolean {
  const d = dateIso.slice(0, 10);

  if (timeRange === "custom") {
    const lo = customFromYear ?? dataYearMin;
    const hi = customToYear ?? dataYearMax;
    const a = Math.min(lo, hi);
    const b = Math.max(lo, hi);
    const y = new Date(`${d}T12:00:00Z`).getUTCFullYear();
    return y >= a && y <= b;
  }

  const roll = { "1y": 1, "3y": 3, "5y": 5, "10y": 10 }[timeRange];
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - roll);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return d >= cutoffStr;
}

export function filterAnnualRowsByPeriod<T extends { fiscalYear: string; date: string }>(
  rows: T[],
  timeRange: ChartTimeRange,
  customFromYear: number | null,
  customToYear: number | null,
): T[] {
  if (rows.length === 0) return rows;
  const sorted = [...rows].sort((a, b) => fiscalYearFromRow(a) - fiscalYearFromRow(b));

  if (timeRange === "custom") {
    const bounds = annualDataYearBounds(sorted);
    if (!bounds) return [];
    const lo = customFromYear ?? bounds.min;
    const hi = customToYear ?? bounds.max;
    const a = Math.min(lo, hi);
    const b = Math.max(lo, hi);
    return sorted.filter((r) => {
      const fy = fiscalYearFromRow(r);
      return fy >= a && fy <= b;
    });
  }

  const n = { "1y": 1, "3y": 3, "5y": 5, "10y": 10 }[timeRange];
  return sorted.slice(-Math.min(n, sorted.length));
}

export function filterDividendQuarterlyByPeriod(
  points: DividendQuarterlyPoint[],
  timeRange: ChartTimeRange,
  customFromYear: number | null,
  customToYear: number | null,
  quarterBounds: { min: number; max: number } | null,
): DividendQuarterlyPoint[] {
  if (points.length === 0) return points;
  const sorted = sortQuarterlyByDateAsc(points);
  const bounds =
    quarterBounds ?? quarterlyDataYearBounds(sorted.map((p) => p.date.slice(0, 10)));
  if (!bounds) return [];

  if (timeRange === "custom") {
    return sorted.filter((p) =>
      quarterlyPeriodEndInRange(
        p.date,
        timeRange,
        customFromYear,
        customToYear,
        bounds.min,
        bounds.max,
      ),
    );
  }

  const take = PRESET_QUARTER_COUNT[timeRange];
  return sorted.slice(-Math.min(take, sorted.length));
}
