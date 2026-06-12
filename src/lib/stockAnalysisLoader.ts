import { fetchStockBundleFromEdgar } from "@/lib/edgar/client";
import { fetchStockBundleFromGemini } from "@/lib/geminiFullStockBundle";
import { fillBundleGapsFromGemini } from "@/lib/geminiBundleGapFill";
import {
  backfillQuarterlyHistoryFromGemini,
  quarterlyHistoryIsThin,
} from "@/lib/geminiQuarterlyBackfill";
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
  gapFillIsDue,
  markFundamentalsSource,
  markGapFillAttempt,
  readAdminEditedAt,
  readFundamentalsSource,
  type CachePayload,
} from "@/lib/stockCache";
import { trimBundleToFundamentalsWindow } from "@/lib/fundamentalsHistoryLimits";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import {
  applyYahooFundamentalsToBundle,
  fetchYahooFundamentalsPayload,
  type YahooFundamentalsPayload,
  type YahooMergeMode,
} from "@/lib/yahooFundamentalsMerge";
import { enrichBundleWithYahooPrices } from "@/lib/yahooStockPriceHistory";

export type { StockAnalysisLoadProgress } from "@/lib/stockLoadProgress";

export type StockAnalysisResult = {
  bundle: StockAnalysisBundle | null;
  error: string | null;
};

export type LoadStockOptions = {
  forceRefresh?: boolean;
  /** Only the admin refresh endpoint may discard admin-edited payloads. */
  overwriteAdminEdits?: boolean;
};

export type LoadStockAnalysisOptions = LoadStockOptions & {
  onProgress?: (e: StockAnalysisLoadProgress) => void;
};

type EnrichOptions = {
  onProgress?: (e: StockAnalysisLoadProgress) => void;
  runGapFill?: boolean;
  /** "fill-gaps" for EDGAR-sourced bundles (as-reported data wins over Yahoo). */
  mergeMode?: YahooMergeMode;
};

async function enrichFundamentalsPipeline(
  bundle: StockAnalysisBundle,
  sym: string,
  yahooPayload: YahooFundamentalsPayload | null | undefined,
  { onProgress, runGapFill = true, mergeMode = "prefer-yahoo" }: EnrichOptions,
): Promise<void> {
  onProgress?.({ kind: "yahoo_fundamentals" });
  const payload = yahooPayload ?? (await fetchYahooFundamentalsPayload(sym));
  if (payload) applyYahooFundamentalsToBundle(bundle, payload, mergeMode);
  appendCalendarAnnualFromQuarterly(bundle);
  trimBundleToFundamentalsWindow(bundle);
  if (runGapFill) {
    onProgress?.({ kind: "gemini_gap_fill" });
    // 20-F/ADR filers: EDGAR+Yahoo leave only a handful of quarters; propose older
    // ones via Gemini but keep only fiscal years that reconcile with SEC annuals.
    if (mergeMode === "fill-gaps" && quarterlyHistoryIsThin(bundle)) {
      await backfillQuarterlyHistoryFromGemini(bundle);
      trimBundleToFundamentalsWindow(bundle);
    }
    await fillBundleGapsFromGemini(bundle);
    markGapFillAttempt(bundle);
  }
}

async function persistStockCache(
  sym: string,
  bundle: StockAnalysisBundle,
  adminEditedAt?: string | null,
): Promise<void> {
  const plain = buildCachePayload(bundle, adminEditedAt);
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
 * SEC EDGAR (as-reported, free) or Gemini x3 for non-SEC symbols → Yahoo merge
 * (fill-gaps for EDGAR, prefer-Yahoo for Gemini) → gap-fill → Yahoo prices → cache upsert.
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
    let row: { payload: unknown; updatedAt: Date } | null = null;
    try {
      row = await prisma.stockAnalysisCache.findUnique({
        where: { symbol: sym },
        select: { payload: true, updatedAt: true },
      });
    } catch {
      row = null;
    }
    const cachedPayload = row ? (row.payload as CachePayload) : null;
    const adminEditedAt = readAdminEditedAt(cachedPayload);

    if (cachedPayload && adminEditedAt && !opts?.overwriteAdminEdits) {
      // Admin-curated report: fundamentals, investor metrics, and quote labels are
      // authoritative — never re-merged from Yahoo/Gemini. Only market price data refreshes.
      const bundle = cachedPayload as StockAnalysisBundle;
      opts?.onProgress?.({ kind: "cache_hit" });
      const adminQuote = { ...bundle.quote };
      const adminInvestor = { ...bundle.investor };
      const adminDividends = bundle.dividendQuarterly;
      opts?.onProgress?.({ kind: "yahoo_prices" });
      await enrichBundleWithYahooPrices(bundle);
      bundle.investor = adminInvestor;
      bundle.dividendQuarterly = adminDividends;
      bundle.quote = {
        ...bundle.quote,
        name: adminQuote.name || bundle.quote.name,
        earningsDate: adminQuote.earningsDate ?? bundle.quote.earningsDate,
      };
      await persistStockCache(sym, bundle, adminEditedAt);
      return { bundle, error: null };
    }

    if (!opts?.forceRefresh) {
      if (row && cachedPayload && cacheIsFresh(cachedPayload, row.updatedAt)) {
        const bundle = cachedPayload as StockAnalysisBundle;
        opts?.onProgress?.({ kind: "cache_hit" });
        const yahooPromise = fetchYahooFundamentalsPayload(sym);
        await enrichFundamentalsPipeline(bundle, sym, await yahooPromise, {
          onProgress: opts?.onProgress,
          runGapFill: gapFillIsDue(cachedPayload),
          mergeMode: readFundamentalsSource(cachedPayload) === "edgar" ? "fill-gaps" : "prefer-yahoo",
        });
        opts?.onProgress?.({ kind: "yahoo_prices" });
        await enrichBundleWithYahooPrices(bundle);
        await persistStockCache(sym, bundle);
        return { bundle, error: null };
      }
    }

    // SEC EDGAR first (as-reported filings, free); Gemini only for non-SEC symbols.
    const yahooPromise = fetchYahooFundamentalsPayload(sym);
    opts?.onProgress?.({ kind: "edgar" });
    let bundle = await fetchStockBundleFromEdgar(sym);
    const source = bundle ? ("edgar" as const) : ("gemini" as const);
    if (!bundle) {
      bundle = await fetchStockBundleFromGemini(sym, {
        onPartStart: (part) => opts?.onProgress?.({ kind: "gemini", step: part, total: 3 }),
      });
    }
    await enrichFundamentalsPipeline(bundle, sym, await yahooPromise, {
      onProgress: opts?.onProgress,
      mergeMode: source === "edgar" ? "fill-gaps" : "prefer-yahoo",
    });
    markFundamentalsSource(bundle, source);
    opts?.onProgress?.({ kind: "yahoo_prices" });
    await enrichBundleWithYahooPrices(bundle);
    await persistStockCache(sym, bundle);
    return { bundle, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load stock data.";
    return { bundle: null, error: message };
  }
}
