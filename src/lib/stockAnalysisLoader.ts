import { fetchStockBundleFromGemini } from "@/lib/geminiFullStockBundle";
import { fillBundleGapsFromGemini } from "@/lib/geminiBundleGapFill";
import { prisma } from "@/lib/prisma";
import type { StockAnalysisLoadProgress } from "@/lib/stockLoadProgress";
import {
  INVALID_TICKER_SYMBOL_MESSAGE,
  isValidStockSymbolInput,
  normalizeStockSymbol,
} from "@/lib/stockSymbol";
import { appendCalendarAnnualFromQuarterly } from "@/lib/annualFromQuarterlyBackfill";
import {
  buildCachePayload,
  cacheIsFresh,
  type CachePayload,
} from "@/lib/stockCache";
import { trimBundleToFundamentalsWindow } from "@/lib/fundamentalsHistoryLimits";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import {
  applyYahooFundamentalsToBundle,
  fetchYahooFundamentalsPayload,
  type YahooFundamentalsPayload,
} from "@/lib/yahooFundamentalsMerge";
import { enrichBundleWithYahooPrices } from "@/lib/yahooStockPriceHistory";

export type { StockAnalysisLoadProgress } from "@/lib/stockLoadProgress";

export type StockAnalysisResult = {
  bundle: StockAnalysisBundle | null;
  error: string | null;
};

export type LoadStockOptions = { forceRefresh?: boolean };

export type LoadStockAnalysisOptions = LoadStockOptions & {
  onProgress?: (e: StockAnalysisLoadProgress) => void;
};

async function enrichFundamentalsPipeline(
  bundle: StockAnalysisBundle,
  sym: string,
  yahooPayload: YahooFundamentalsPayload | null | undefined,
  onProgress?: (e: StockAnalysisLoadProgress) => void,
): Promise<void> {
  onProgress?.({ kind: "yahoo_fundamentals" });
  const payload = yahooPayload ?? (await fetchYahooFundamentalsPayload(sym));
  if (payload) applyYahooFundamentalsToBundle(bundle, payload);
  appendCalendarAnnualFromQuarterly(bundle);
  trimBundleToFundamentalsWindow(bundle);
  onProgress?.({ kind: "gemini_gap_fill" });
  await fillBundleGapsFromGemini(bundle);
}

async function persistStockCache(sym: string, bundle: StockAnalysisBundle): Promise<void> {
  const plain = buildCachePayload(bundle);
  try {
    await prisma.stockAnalysisCache.upsert({
      where: { symbol: sym },
      create: { symbol: sym, payload: plain },
      update: { payload: plain },
    });
  } catch {
    // DB optional in some dev setups
  }
}

/**
 * Stock analysis: validate ticker → **DB first** (fresh up to 30 days) → on miss/stale:
 * parallel Yahoo fundamentals + Gemini x3 → merge → gap-fill → Yahoo prices → cache upsert.
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

      if (row && cacheIsFresh(row.payload as CachePayload, row.updatedAt)) {
        const bundle = row.payload as StockAnalysisBundle;
        opts?.onProgress?.({ kind: "cache_hit" });
        const yahooPromise = fetchYahooFundamentalsPayload(sym);
        await enrichFundamentalsPipeline(bundle, sym, await yahooPromise, opts?.onProgress);
        opts?.onProgress?.({ kind: "yahoo_prices" });
        await enrichBundleWithYahooPrices(bundle);
        await persistStockCache(sym, bundle);
        return { bundle, error: null };
      }
    }

    const yahooPromise = fetchYahooFundamentalsPayload(sym);
    const bundle = await fetchStockBundleFromGemini(sym, {
      onPartStart: (part) => opts?.onProgress?.({ kind: "gemini", step: part, total: 3 }),
    });
    await enrichFundamentalsPipeline(bundle, sym, await yahooPromise, opts?.onProgress);
    opts?.onProgress?.({ kind: "yahoo_prices" });
    await enrichBundleWithYahooPrices(bundle);
    await persistStockCache(sym, bundle);
    return { bundle, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load stock data.";
    return { bundle: null, error: message };
  }
}
