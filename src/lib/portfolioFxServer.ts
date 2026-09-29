import "server-only";

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
];

/** Fetch spot rates used to convert quote currency ↔ holding currency. */
export async function fetchPortfolioFxRates(): Promise<PortfolioFxRates> {
  const [eurUsd, gbpUsd, ...extra] = await Promise.all([
    usdPerUnit("EURUSD=X"),
    usdPerUnit("GBPUSD=X"),
    ...EXTRA_USD_PAIRS.map(([, symbol]) => usdPerUnit(symbol)),
  ]);
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
