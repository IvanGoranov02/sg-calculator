/**
 * Dip-finder lookback windows: price vs SMA over the selected range.
 * 200-day SMA stays a separate comparison (from the Yahoo quote).
 */

export const DIP_RANGES = ["5d", "10d", "1m", "3m", "6m", "1y"] as const;
export type DipRange = (typeof DIP_RANGES)[number];

const TRADING_DAYS: Record<DipRange, number> = {
  "5d": 5,
  "10d": 10,
  "1m": 21,
  "3m": 63,
  "6m": 126,
  "1y": 252,
};

export function isDipRange(v: string): v is DipRange {
  return (DIP_RANGES as readonly string[]).includes(v);
}

export type QuoteHistoryBar = {
  date: string;
  close: number;
};

export function closesOldestFirst(bars: QuoteHistoryBar[]): number[] {
  return [...bars]
    .filter((b) => Number.isFinite(b.close))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((b) => b.close);
}

export function dipRangeTradingDays(range: DipRange): number {
  return TRADING_DAYS[range];
}

/** Calendar days of history to fetch so the SMA window can fill (weekends/holidays). */
export function dipRangeFetchCalendarDays(range: DipRange): number {
  switch (range) {
    case "5d":
      return 16;
    case "10d":
      return 24;
    case "1m":
      return 50;
    case "3m":
      return 120;
    case "6m":
      return 220;
    case "1y":
      return 400;
  }
}

export function simpleMovingAverage(values: number[], window: number): number | null {
  if (!Number.isInteger(window) || window <= 0) return null;
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  const n = Math.min(window, finite.length);
  if (n < 1) return null;
  const slice = finite.slice(-n);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / slice.length;
}

export function dipVsAveragePct(price: number, average: number | null | undefined): number | null {
  if (average == null || average === 0) return null;
  if (!Number.isFinite(price) || !Number.isFinite(average)) return null;
  return ((price - average) / average) * 100;
}

/** Percent change from the first close in the window to the last (lookback return). */
export function lookbackChangePct(closesOldestFirst: number[], window: number): number | null {
  if (!Number.isInteger(window) || window <= 1) return null;
  const finite = closesOldestFirst.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return null;
  const slice = finite.slice(-Math.min(window, finite.length));
  const first = slice[0];
  const last = slice[slice.length - 1];
  if (!Number.isFinite(first) || first === 0 || !Number.isFinite(last)) return null;
  return ((last - first) / first) * 100;
}

export type DipWindowMetrics = {
  windowSma: number | null;
  dipVsWindowSmaPct: number | null;
  lookbackChangePct: number | null;
};

/**
 * SMA and lookback over the selected window. Uses the last `window` closes;
 * if fewer bars exist, uses what is available (at least 1 for SMA, 2 for lookback).
 */
export function dipMetricsForRange(
  closesOldestFirst: number[],
  range: DipRange,
  lastPrice: number,
): DipWindowMetrics {
  const window = dipRangeTradingDays(range);
  const windowSma = simpleMovingAverage(closesOldestFirst, window);
  return {
    windowSma,
    dipVsWindowSmaPct: dipVsAveragePct(lastPrice, windowSma),
    lookbackChangePct: lookbackChangePct(closesOldestFirst, window),
  };
}
