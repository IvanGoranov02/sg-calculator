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
import { payloadToEditableBundle } from "@/lib/adminCacheApi";
import {
  applyAdminOverlay,
  buildCachePayload,
  cacheIsFresh,
  earningsReportDue,
  gapFillIsDue,
  markFundamentalsSource,
  markGapFillAttempt,
  readAdminEditedAt,
  readAdminOverlay,
  readFundamentalsSource,
  type BuildCachePayloadOptions,
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
  opts?: BuildCachePayloadOptions,
): Promise<void> {
  const plain = buildCachePayload(bundle, opts);
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

/** Fresh fundamentals from SEC EDGAR (preferred) or Gemini, then Yahoo merge + gap-fill. */
async function fetchFreshFundamentals(
  sym: string,
  opts: LoadStockAnalysisOptions | undefined,
): Promise<{ bundle: StockAnalysisBundle; source: "edgar" | "gemini" }> {
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
  return { bundle, source };
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
      // Admin-curated report. Curated values win forever via the overlay. We only
      // re-fetch fundamentals when a new earnings report is known to have dropped
      // (earningsReportDue); otherwise just refresh live prices. Either way the admin
      // overlay is re-applied last, so curated fields are never overwritten.
      opts?.onProgress?.({ kind: "cache_hit" });
      // Migration: rows curated before overlays existed reconstruct it from the bundle.
      const overlay = readAdminOverlay(cachedPayload) ?? payloadToEditableBundle(cachedPayload);
      const due = !opts?.forceRefresh ? earningsReportDue(cachedPayload) : true;

      let working: StockAnalysisBundle;
      let lastFullFetchAt = cachedPayload.__lastFullFetchAt ?? adminEditedAt;
      if (due && overlay) {
        const fresh = await fetchFreshFundamentals(sym, opts);
        working = fresh.bundle;
        lastFullFetchAt = new Date().toISOString();
      } else {
        working = cachedPayload as StockAnalysisBundle;
      }

      opts?.onProgress?.({ kind: "yahoo_prices" });
      await enrichBundleWithYahooPrices(working);
      if (overlay) applyAdminOverlay(working, overlay);
      await persistStockCache(sym, working, {
        adminEditedAt,
        adminOverlay: overlay ?? undefined,
        lastFullFetchAt,
      });
      return { bundle: working, error: null };
    }

    if (!opts?.forceRefresh) {
      // Serve cache while fresh, UNLESS a new earnings report has dropped since the
      // last full fetch — then fall through and re-fetch from source.
      if (
        row &&
        cachedPayload &&
        cacheIsFresh(cachedPayload, row.updatedAt) &&
        !earningsReportDue(cachedPayload)
      ) {
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
        await persistStockCache(sym, bundle, {
          lastFullFetchAt: cachedPayload.__lastFullFetchAt ?? undefined,
        });
        return { bundle, error: null };
      }
    }

    const { bundle } = await fetchFreshFundamentals(sym, opts);
    opts?.onProgress?.({ kind: "yahoo_prices" });
    await enrichBundleWithYahooPrices(bundle);
    await persistStockCache(sym, bundle, { lastFullFetchAt: new Date().toISOString() });
    return { bundle, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load stock data.";
    return { bundle: null, error: message };
  }
}
