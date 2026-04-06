import { applyGeminiFundamentalGaps } from "@/lib/geminiFundamentalsGapFill";
import { fetchStockBundleFromGemini } from "@/lib/geminiFullStockBundle";
import { prisma } from "@/lib/prisma";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { enrichBundleWithYahooPrices } from "@/lib/yahooStockPriceHistory";

export type StockAnalysisResult = {
  bundle: StockAnalysisBundle | null;
  error: string | null;
};

/**
 * Bump this whenever the normalizer or prompt changes significantly
 * so stale caches (produced by older normalisation) are discarded.
 */
const CACHE_SCHEMA_VERSION = 3;

const CACHE_TTL_MS = (() => {
  const h = Number(process.env.STOCK_CACHE_TTL_HOURS?.trim());
  if (Number.isFinite(h) && h > 0) return h * 3600_000;
  return 24 * 3600_000;
})();

type CachePayload = StockAnalysisBundle & { __cacheVersion?: number };

function cacheIsFresh(payload: CachePayload, updatedAt: Date): boolean {
  if ((payload.__cacheVersion ?? 0) < CACHE_SCHEMA_VERSION) return false;
  return Date.now() - updatedAt.getTime() < CACHE_TTL_MS;
}

export type LoadStockOptions = { forceRefresh?: boolean };

/**
 * Stock analysis: Prisma cache (fundamentals from Gemini) → optional CF gap fill → upsert on miss →
 * **always** overlay Yahoo for live quote + daily/intraday price history (fundamentals unchanged).
 */
export async function loadStockAnalysis(
  symbol: string,
  opts?: LoadStockOptions,
): Promise<StockAnalysisResult> {
  const sym = symbol.trim().toUpperCase() || "AAPL";

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
        await enrichBundleWithYahooPrices(bundle);
        return { bundle, error: null };
      }
    }

    const bundle = await fetchStockBundleFromGemini(sym);
    await applyGeminiFundamentalGaps(sym, bundle);

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

    await enrichBundleWithYahooPrices(bundle);
    return { bundle, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load stock data.";
    return { bundle: null, error: message };
  }
}
