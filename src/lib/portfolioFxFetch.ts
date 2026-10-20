/** Server-side FX fetch + cache. Import via portfolioFxServer in app code (server-only guard). */
import YahooFinance from "yahoo-finance2";

import type { PortfolioFxRates } from "@/lib/portfolioFx";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

async function usdPerUnit(pairSymbol: string): Promise<number | null> {
  try {
    const raw = await yahooFinance.quote(pairSymbol);
    const q = Array.isArray(raw) ? raw[0] : raw;
    const n = Number((q as { regularMarketPrice?: unknown })?.regularMarketPrice);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

const EXTRA_USD_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["CHF", "CHFUSD=X"],
  ["CAD", "CADUSD=X"],
  ["AUD", "AUDUSD=X"],
  ["HKD", "HKDUSD=X"],
  ["JPY", "JPYUSD=X"],
  ["SEK", "SEKUSD=X"],
  ["NOK", "NOKUSD=X"],
  ["DKK", "DKKUSD=X"],
  ["PLN", "PLNUSD=X"],
  ["ISK", "ISKUSD=X"],
  ["NZD", "NZDUSD=X"],
  ["CZK", "CZKUSD=X"],
  ["HUF", "HUFUSD=X"],
];

const FX_TTL_MS = 10 * 60_000;
let cached: { rates: PortfolioFxRates; expiresAt: number } | null = null;
let inFlight: Promise<PortfolioFxRates> | null = null;

async function loadPortfolioFxRates(): Promise<PortfolioFxRates> {
  const symbols = ["EURUSD=X", "GBPUSD=X", ...EXTRA_USD_PAIRS.map(([, symbol]) => symbol)];
  let rates: Array<number | null>;
  try {
    const quotes = await yahooFinance.quote(symbols);
    const bySymbol = new Map(quotes.map((q) => [q.symbol, q.regularMarketPrice]));
    rates = symbols.map((symbol) => {
      const n = Number(bySymbol.get(symbol));
      return Number.isFinite(n) && n > 0 ? n : null;
    });
  } catch {
    rates = await Promise.all(symbols.map(usdPerUnit));
  }
  const [eurUsd, gbpUsd, ...extra] = rates;
  const usdPerUnitRates: Partial<Record<string, number>> = {};
  EXTRA_USD_PAIRS.forEach(([ccy], i) => {
    const rate = extra[i];
    if (rate != null && rate > 0) usdPerUnitRates[ccy] = rate;
  });
  return {
    eurPerUsd: eurUsd != null && eurUsd > 0 ? 1 / eurUsd : null,
    gbpPerUsd: gbpUsd != null && gbpUsd > 0 ? 1 / gbpUsd : null,
    usdPerUnit: usdPerUnitRates,
  };
}

/** Fetch shared spot rates with a ten-minute TTL and concurrent-load deduplication. */
export async function fetchPortfolioFxRates(): Promise<PortfolioFxRates> {
  if (cached && cached.expiresAt > Date.now()) return cached.rates;
  if (!inFlight) {
    inFlight = loadPortfolioFxRates().then((rates) => {
      // Don't pin an outage result for ten minutes.
      if (rates.eurPerUsd != null) cached = { rates, expiresAt: Date.now() + FX_TTL_MS };
      return rates;
    }).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
