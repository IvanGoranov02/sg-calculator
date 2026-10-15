/**
 * Server-only: seed the dividend growth calculator from Yahoo — current price,
 * annual dividend per share, yield, and a historical dividend CAGR when derivable.
 */

import { withTimeout } from "@/lib/asyncTimeout";
import { normalizeYahooDividendYieldToDecimal } from "@/lib/format";
import { dividendRateToMajorUnits, normalizeQuotePrice, quoteCurrencyMajor } from "@/lib/portfolioFx";
import { yahooFinance } from "@/lib/yahooFinanceClient";

export type DividendSeed = {
  symbol: string;
  name: string;
  /** Price and dividends share this listing currency, in major units. */
  currency: string;
  currentPrice: number;
  /** Annual dividend per share (forward rate when available, else trailing). */
  annualDividendPerShare: number;
  /** Dividend yield as a decimal fraction (0.025 = 2.5%). */
  dividendYield: number | null;
  /** Suggested annual dividend growth %, derived from history or a sane default. */
  suggestedGrowthPct: number;
  /** True when the suggested growth came from real dividend history. */
  growthFromHistory: boolean;
};

const DEFAULT_GROWTH_PCT = 6;
const REQUEST_TIMEOUT_MS = 5_000;

export type DividendEvent = { date?: Date | number | string; amount?: number };

/** Annual dividend CAGR from calendar years entirely covered by the history request. */
export function dividendCagrFromEvents(
  events: DividendEvent[],
  historyStart: Date,
  historyEnd: Date = new Date(),
): number | null {
  if (!Number.isFinite(historyStart.getTime()) || !Number.isFinite(historyEnd.getTime())) return null;
  const byYear = new Map<number, number>();
  for (const e of events) {
    const amt = Number(e?.amount);
    if (!Number.isFinite(amt) || amt <= 0 || e?.date == null) continue;
    const dateValue = typeof e.date === "number" && Math.abs(e.date) < 100_000_000_000
      ? e.date * 1000
      : e.date;
    const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (Number.isNaN(d.getTime())) continue;
    if (d < historyStart || d > historyEnd) continue;
    const y = d.getUTCFullYear();
    const yearStart = Date.UTC(y, 0, 1);
    const nextYearStart = Date.UTC(y + 1, 0, 1);
    // Both the oldest and newest years can be truncated by an arbitrary request date.
    if (yearStart < historyStart.getTime() || nextYearStart > historyEnd.getTime()) continue;
    byYear.set(y, (byYear.get(y) ?? 0) + amt);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  if (years.length < 3) return null;
  const first = years[0];
  const last = years[years.length - 1];
  const v0 = byYear.get(first)!;
  const v1 = byYear.get(last)!;
  const span = last - first;
  if (v0 <= 0 || v1 <= 0 || span <= 0) return null;
  const cagr = (v1 / v0) ** (1 / span) - 1;
  if (!Number.isFinite(cagr)) return null;
  // Keep within a believable band.
  return Math.max(-0.1, Math.min(0.3, cagr));
}

export async function fetchDividendSeed(symbol: string): Promise<DividendSeed | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;
  const period2 = new Date();
  const period1 = new Date(period2);
  period1.setUTCFullYear(period1.getUTCFullYear() - 8);

  try {
    const moduleOptions = { fetchOptions: { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) } };
    const [qRaw, chartRaw] = await Promise.all([
      withTimeout(yahooFinance.quote(sym, {}, moduleOptions), REQUEST_TIMEOUT_MS, `Dividend quote ${sym}`),
      withTimeout(yahooFinance.chart(sym, { period1, period2, interval: "1mo", events: "dividends" }, moduleOptions),
        REQUEST_TIMEOUT_MS, `Dividend history ${sym}`).catch(() => null),
    ]);

    const q = Array.isArray(qRaw) ? qRaw[0] : qRaw;
    if (!q) return null;
    let events: DividendEvent[] = [];
    const ev = (chartRaw as { events?: { dividends?: unknown } } | null)?.events?.dividends;
    if (Array.isArray(ev)) events = ev as DividendEvent[];
    else if (ev && typeof ev === "object") events = Object.values(ev) as DividendEvent[];

    return buildDividendSeed(sym, q as unknown as Record<string, unknown>, events, period1, period2);
  } catch {
    return null;
  }
}

/** Yahoo price, annual rate and payment events do not always share minor-unit conventions. */
export function buildDividendSeed(
  symbol: string,
  quote: Record<string, unknown>,
  events: DividendEvent[],
  historyStart: Date,
  historyEnd: Date,
): DividendSeed | null {
  if (quote.quoteType === "NONE") return null;
  const rawPrice = Number(quote.regularMarketPrice ?? 0);
  if (!Number.isFinite(rawPrice) || rawPrice <= 0) return null;
  const rawCurrency = typeof quote.currency === "string" ? quote.currency : "USD";
  const normalized = normalizeQuotePrice(rawPrice, rawCurrency);
  const annualRate = Number(quote.dividendRate);
  const rawDps = Number.isFinite(annualRate) && annualRate > 0
    ? annualRate : Number(quote.trailingAnnualDividendRate ?? 0);
  const dps = dividendRateToMajorUnits(rawDps, rawPrice, rawCurrency);
  const { minorPerMajor } = quoteCurrencyMajor(rawCurrency);
  const majorEvents = events.map((event) => ({
    ...event, amount: event.amount == null ? event.amount : event.amount / minorPerMajor,
  }));
  const cagr = dividendCagrFromEvents(majorEvents, historyStart, historyEnd);
  const rawYield = quote.dividendYield ?? quote.trailingAnnualDividendYield;
  const yieldDec = normalizeYahooDividendYieldToDecimal(
    typeof rawYield === "number" ? rawYield : null,
  );
  return {
    symbol: String(quote.symbol ?? symbol).toUpperCase(),
    name: String(quote.longName ?? quote.shortName ?? symbol),
    currency: normalized.currency,
    currentPrice: normalized.price,
    annualDividendPerShare: dps != null && Number.isFinite(dps) && dps > 0 ? dps : 0,
    dividendYield: yieldDec,
    suggestedGrowthPct: cagr != null ? Number((cagr * 100).toFixed(1)) : DEFAULT_GROWTH_PCT,
    growthFromHistory: cagr != null,
  };
}
