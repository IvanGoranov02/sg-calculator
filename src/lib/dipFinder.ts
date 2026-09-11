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

export type DipFinderQuoteInput = {
  symbol: string;
  price: number;
  dipVsSma200Pct: number | null;
  twoHundredDayAverage: number | null;
};

export type DipChartRow = {
  symbol: string;
  dipPct: number;
  dipVsSma200Pct: number | null;
  lookbackChangePct: number | null;
  windowSma: number | null;
  sma200: number | null;
};

/** Default Y domain when there is no data to plot. */
export const DIP_CHART_Y_EMPTY_MIN = -5;
export const DIP_CHART_Y_EMPTY_MAX = 5;

function roundDownToStep(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

function roundUpToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

/** Tick step sized to the padded domain so short ranges zoom in (e.g. ±5%). */
export function dipChartTickStep(min: number, max: number): number {
  const span = max - min;
  if (span <= 8) return 1;
  if (span <= 20) return 2;
  if (span <= 50) return 5;
  return 10;
}

/** Y domain: fit plotted values with ~10% padding; no fixed ±45% window. */
export function dipChartYDomain(values: number[]): { min: number; max: number } {
  if (values.length === 0) {
    return { min: DIP_CHART_Y_EMPTY_MIN, max: DIP_CHART_Y_EMPTY_MAX };
  }

  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);

  let lo = dataMin;
  let hi = dataMax;

  if (lo === hi) {
    const pad = Math.max(1, Math.abs(lo) * 0.15) || 2;
    lo -= pad;
    hi += pad;
  } else {
    const span = hi - lo;
    const pad = Math.max(span * 0.1, 0.5);
    lo -= pad;
    hi += pad;
  }

  // Always include 0 so Recharts bars baseline correctly and the zero ref line is visible.
  lo = Math.min(lo, 0);
  hi = Math.max(hi, 0);

  const step = dipChartTickStep(lo, hi);
  let min = roundDownToStep(lo, step);
  let max = roundUpToStep(hi, step);
  if (min >= max) max = min + step;

  return { min, max };
}

export function dipChartYTicks(min: number, max: number): number[] {
  const step = dipChartTickStep(min, max);
  const start = roundUpToStep(min, step);
  const ticks: number[] = [];
  for (let v = start; v <= max; v += step) ticks.push(v);
  return ticks;
}

export function formatDipAxisPct(v: number): string {
  return `${Math.round(v)}%`;
}

/** Chart row for the selected range; omits symbols without window SMA (no 200d fallback). */
export type DipHistorySymbolMapping = {
  portfolioKey: string;
  yahooSymbol: string;
};

/** Map portfolio storage keys to Yahoo symbols used for history fetches. */
export function buildDipHistorySymbolMappings(
  portfolioKeys: string[],
  resolveYahooSymbol: (portfolioKey: string) => string | null | undefined,
): DipHistorySymbolMapping[] {
  return portfolioKeys.map((portfolioKey) => {
    const resolved = resolveYahooSymbol(portfolioKey)?.trim().toUpperCase();
    return {
      portfolioKey,
      yahooSymbol: resolved && resolved.length > 0 ? resolved : portfolioKey,
    };
  });
}

/**
 * Align history closes with a normalized quote price (e.g. portfolio GBp → GBP).
 * When the last close is ~100× the live quote, Yahoo history is still in pence.
 */
export function scaleHistoryBarsToQuotePrice(
  bars: QuoteHistoryBar[],
  quotePrice: number,
): QuoteHistoryBar[] {
  if (bars.length === 0 || !Number.isFinite(quotePrice) || quotePrice <= 0) return bars;
  const last = bars[bars.length - 1]?.close;
  if (!Number.isFinite(last) || last <= 0) return bars;
  const ratio = last / quotePrice;
  if (ratio > 50 && ratio < 200) {
    return bars.map((b) => ({ ...b, close: b.close / 100 }));
  }
  return bars;
}

/** Re-key Yahoo history rows onto portfolio symbols for the dip finder. */
export function remapPortfolioDipHistory(
  raw: Record<string, QuoteHistoryBar[]>,
  mappings: DipHistorySymbolMapping[],
  quotePriceByKey: Record<string, number | null | undefined>,
): Record<string, QuoteHistoryBar[]> {
  const out: Record<string, QuoteHistoryBar[]> = {};
  for (const { portfolioKey, yahooSymbol } of mappings) {
    const bars = raw[yahooSymbol] ?? raw[portfolioKey] ?? [];
    const price = quotePriceByKey[portfolioKey];
    out[portfolioKey] =
      price != null && Number.isFinite(price) ? scaleHistoryBarsToQuotePrice(bars, price) : bars;
  }
  return out;
}

export function dipChartRowForQuote(
  quote: DipFinderQuoteInput,
  bars: QuoteHistoryBar[],
  dipRange: DipRange,
): DipChartRow | null {
  const closes = closesOldestFirst(bars);
  const m = dipMetricsForRange(closes, dipRange, quote.price);
  const dipPct = m.dipVsWindowSmaPct;
  if (dipPct == null || !Number.isFinite(dipPct)) return null;
  return {
    symbol: quote.symbol,
    dipPct,
    dipVsSma200Pct: quote.dipVsSma200Pct,
    lookbackChangePct: m.lookbackChangePct,
    windowSma: m.windowSma,
    sma200: quote.twoHundredDayAverage,
  };
}
