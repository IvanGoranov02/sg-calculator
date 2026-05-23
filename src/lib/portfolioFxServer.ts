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

/** Fetch spot rates used to convert quote currency ↔ holding currency. */
export async function fetchPortfolioFxRates(): Promise<PortfolioFxRates> {
  const [eurUsd, gbpUsd] = await Promise.all([usdPerUnit("EURUSD=X"), usdPerUnit("GBPUSD=X")]);
  return {
    eurPerUsd: eurUsd != null && eurUsd > 0 ? 1 / eurUsd : null,
    gbpPerUsd: gbpUsd != null && gbpUsd > 0 ? 1 / gbpUsd : null,
  };
}
