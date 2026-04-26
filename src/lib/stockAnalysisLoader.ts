import { fetchStockBundleFromGemini } from "@/lib/geminiFullStockBundle";
import { prisma } from "@/lib/prisma";
import type { StockAnalysisLoadProgress } from "@/lib/stockLoadProgress";
import {
  INVALID_TICKER_SYMBOL_MESSAGE,
  isValidStockSymbolInput,
  normalizeStockSymbol,
} from "@/lib/stockSymbol";
import { appendCalendarAnnualFromQuarterly } from "@/lib/annualFromQuarterlyBackfill";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { enrichBundleFundamentalsFromYahoo } from "@/lib/yahooFundamentalsMerge";
import { enrichBundleWithYahooPrices } from "@/lib/yahooStockPriceHistory";

export type { StockAnalysisLoadProgress } from "@/lib/stockLoadProgress";

export type StockAnalysisResult = {
  bundle: StockAnalysisBundle | null;
  error: string | null;
};

/**
 * Bump this whenever the normalizer or prompt changes significantly
 * so stale caches (produced by older normalisation) are discarded.
 */
const CACHE_SCHEMA_VERSION = 9;

type CachePayload = StockAnalysisBundle & { __cacheVersion?: number };

/** Fundamentals cache is fresh for the same calendar month (UTC) as `updatedAt`. */
function cacheIsFreshForMonth(payload: CachePayload, updatedAt: Date): boolean {
  if ((payload.__cacheVersion ?? 0) < CACHE_SCHEMA_VERSION) return false;
  const now = new Date();
  return (
    updatedAt.getUTCFullYear() === now.getUTCFullYear() &&
    updatedAt.getUTCMonth() === now.getUTCMonth()
  );
}

export type LoadStockOptions = { forceRefresh?: boolean };

export type LoadStockAnalysisOptions = LoadStockOptions & {
  onProgress?: (e: StockAnalysisLoadProgress) => void;
};

/**
 * Stock analysis: validate ticker → **DB first** (Gemini bundle, fresh for current month) → on miss/stale:
 * Gemini → Yahoo fundamentals merge → upsert → **always** Yahoo for live quote + history + EUR/USD.
 */
export async function loadStockAnalysis(
  symbol: string,
  opts?: LoadStockAnalysisOptions,
): Promise<StockAnalysisResult> {
  const raw = symbol.trim();
  if (!isValidStockSymbolInput(raw)) {
    return { bundle: null, error: INVALID_TICKER_SYMBOL_MESSAGE };
  }
  const sym = normalizeStockSymbol(raw);

  try {
    if (!opts?.forceRefresh) {
      let row: { payload: unknown; updatedAt: Date } | null = null;
      try {
        row = await prisma.stockAnalysisCache.findUnique({
          where: { symbol: sym },
          select: { payload: true, updatedAt: true },
        });
      } catch {
        row = null;
      }

      if (row && cacheIsFreshForMonth(row.payload as CachePayload, row.updatedAt)) {
        const bundle = row.payload as StockAnalysisBundle;
        opts?.onProgress?.({ kind: "cache_hit" });
        opts?.onProgress?.({ kind: "yahoo_fundamentals" });
        await enrichBundleFundamentalsFromYahoo(bundle);
        appendCalendarAnnualFromQuarterly(bundle);
        opts?.onProgress?.({ kind: "yahoo_prices" });
        await enrichBundleWithYahooPrices(bundle);
        return { bundle, error: null };
      }
    }

    const bundle = await fetchStockBundleFromGemini(sym, {
      onPartStart: (part) => opts?.onProgress?.({ kind: "gemini", step: part, total: 3 }),
    });
    opts?.onProgress?.({ kind: "yahoo_fundamentals" });
    await enrichBundleFundamentalsFromYahoo(bundle);
    appendCalendarAnnualFromQuarterly(bundle);

    const plain = JSON.parse(JSON.stringify({ ...bundle, __cacheVersion: CACHE_SCHEMA_VERSION })) as object;
    try {
      await prisma.stockAnalysisCache.upsert({
        where: { symbol: sym },
        create: { symbol: sym, payload: plain },
        update: { payload: plain },
      });
    } catch {
      // DB optional in some dev setups
    }

    opts?.onProgress?.({ kind: "yahoo_prices" });
    await enrichBundleWithYahooPrices(bundle);
    return { bundle, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load stock data.";
    return { bundle: null, error: message };
  }
}
