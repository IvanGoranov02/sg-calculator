import { fetchStockBundleFromEdgar } from "@/lib/edgar/client";
import { fetchStockBundleFromFmp, fmpApiKey } from "@/lib/fmp/client";
import { fetchStockBundleFromGemini, GEMINI_FULL_BUNDLE_BUDGET_MS } from "@/lib/geminiFullStockBundle";
import { fillBundleGapsFromGemini } from "@/lib/geminiBundleGapFill";
import {
  backfillQuarterlyHistoryFromGemini,
  quarterlyHistoryIsThin,
} from "@/lib/geminiQuarterlyBackfill";
import { withRetry, mutateWithinTimeout, withTimeoutFallback } from "@/lib/asyncTimeout";
import { prisma } from "@/lib/prisma";
import { isTransientPrismaError } from "@/lib/prismaPool";
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
  markYahooFundamentalsRefresh,
  readAdminEditedAt,
  readAdminOverlay,
  readFundamentalsSource,
  yahooFundamentalsAreDue,
  type BuildCachePayloadOptions,
  type CachePayload,
  type FundamentalsSource,
} from "@/lib/stockCache";
import { sanitizeBundleDilutedShares } from "@/lib/shareCountSanity";
import { trimBundleToFundamentalsWindow } from "@/lib/fundamentalsHistoryLimits";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import {
  applyYahooFundamentalsToBundle,
  fetchYahooFundamentalsPayload,
  type YahooFundamentalsPayload,
  type YahooMergeMode,
} from "@/lib/yahooFundamentalsMerge";
import {
  enrichBundleWithYahooPrices,
  reconcileFundamentalsCurrency,
} from "@/lib/yahooStockPriceHistory";

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
  skipYahooRefresh?: boolean;
  /** "fill-gaps" for EDGAR-sourced bundles (as-reported data wins over Yahoo). */
  mergeMode?: YahooMergeMode;
};

const PRISMA_CACHE_TIMEOUT_MS = 8_000;
const PRISMA_CACHE_ATTEMPTS = 2;
const YAHOO_STEP_TIMEOUT_MS = 20_000;
const GEMINI_GAP_FILL_BUDGET_MS = 22_000;

function logLoadStep(sym: string, step: string, startedAt: number, extra?: string): void {
  const ms = Date.now() - startedAt;
  console.log(`[stock-load] ${sym} ${step} ${ms}ms${extra ? ` ${extra}` : ""}`);
}

async function readStockCache(sym: string): Promise<{ payload: unknown; updatedAt: Date } | null> {
  try {
    return await withRetry(
      () =>
        prisma.stockAnalysisCache.findUnique({
          where: { symbol: sym },
          select: { payload: true, updatedAt: true },
        }),
      {
        attempts: PRISMA_CACHE_ATTEMPTS,
        timeoutMs: PRISMA_CACHE_TIMEOUT_MS,
        label: `cache read ${sym}`,
        retryIf: isTransientPrismaError,
        delayMs: 150,
      },
    );
  } catch (e) {
    console.warn(
      `[stock-load] ${sym} cache read failed:`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

async function enrichFundamentalsPipeline(
  bundle: StockAnalysisBundle,
  sym: string,
  yahooPayload: YahooFundamentalsPayload | null | undefined,
  { onProgress, runGapFill = true, skipYahooRefresh = false, mergeMode = "prefer-yahoo" }: EnrichOptions,
): Promise<void> {
  if (!skipYahooRefresh) onProgress?.({ kind: "yahoo_fundamentals" });
  const y0 = Date.now();
  const payload =
    skipYahooRefresh ? null : yahooPayload !== undefined
      ? yahooPayload
      : await fetchYahooWithDeadline(sym);
  if (!skipYahooRefresh) markYahooFundamentalsRefresh(bundle, payload != null);
  if (payload) applyYahooFundamentalsToBundle(bundle, payload, mergeMode);
  logLoadStep(sym, "yahoo_fundamentals", y0, payload ? "ok" : "skip");
  sanitizeBundleDilutedShares(bundle);
  appendCalendarAnnualFromQuarterly(bundle);
  trimBundleToFundamentalsWindow(bundle);
  if (runGapFill) {
    onProgress?.({ kind: "gemini_gap_fill" });
    const g0 = Date.now();
    try {
      await mutateWithinTimeout(
        bundle,
        async (working) => {
          if (mergeMode === "fill-gaps" && quarterlyHistoryIsThin(working)) {
            await backfillQuarterlyHistoryFromGemini(working);
            trimBundleToFundamentalsWindow(working);
          }
          await fillBundleGapsFromGemini(working);
        },
        GEMINI_GAP_FILL_BUDGET_MS,
        `gemini gap-fill ${sym}`,
      );
    } catch (e) {
      console.warn(
        `[stock-load] ${sym} gap-fill skipped:`,
        e instanceof Error ? e.message : e,
      );
    }
    logLoadStep(sym, "gemini_gap_fill", g0);
    markGapFillAttempt(bundle);
  }
  sanitizeBundleDilutedShares(bundle);
  if (payload || runGapFill) {
    // Changed quarters/DPS need a new listing-cash check even if the previous price refresh is recent.
    delete (bundle as StockAnalysisBundle & { __dividendHistoryRefreshedAt?: string }).__dividendHistoryRefreshedAt;
  }
}

async function fetchYahooWithDeadline(sym: string): Promise<YahooFundamentalsPayload | null> {
  const controller = new AbortController();
  try {
    return await withTimeoutFallback(
      fetchYahooFundamentalsPayload(sym, controller.signal),
      YAHOO_STEP_TIMEOUT_MS,
      `yahoo fundamentals ${sym}`,
      null,
    );
  } finally {
    controller.abort();
  }
}

type CacheReadVersion = {
  updatedAt: Date;
  lastFullFetchAt: string;
  adminEditedAt: string | null;
};

function cacheReadVersion(row: { payload: unknown; updatedAt: Date } | null): CacheReadVersion | null {
  if (!row) return null;
  const payload = row.payload as Partial<CachePayload> | null;
  return {
    updatedAt: row.updatedAt,
    lastFullFetchAt: payload?.__lastFullFetchAt ?? payload?.__adminEditedAt ?? row.updatedAt.toISOString(),
    adminEditedAt: payload?.__adminEditedAt ?? null,
  };
}

export async function persistStockCache(
  sym: string,
  bundle: StockAnalysisBundle,
  opts?: BuildCachePayloadOptions,
  expectedVersion?: CacheReadVersion | null,
  writesFreshReports = false,
): Promise<void> {
  const plain = buildCachePayload(bundle, opts);
  const t0 = Date.now();
  try {
    const persisted = await withRetry(
      async () => {
        if (expectedVersion) {
          const updateVersion = (updatedAt: Date) => prisma.stockAnalysisCache.updateMany({
            where: { symbol: sym, updatedAt },
            data: { payload: plain },
          });
          const result = await updateVersion(expectedVersion.updatedAt);
          if (result.count > 0 || !writesFreshReports) return result.count > 0;
          const current = await prisma.stockAnalysisCache.findUnique({
            where: { symbol: sym }, select: { payload: true, updatedAt: true },
          });
          const currentVersion = cacheReadVersion(current);
          if (!currentVersion || currentVersion.lastFullFetchAt !== expectedVersion.lastFullFetchAt
            || currentVersion.adminEditedAt !== expectedVersion.adminEditedAt) return false;
          // A live-price write may have won while reports were fetched. Retry once, preserving new reports/admin edits.
          return (await updateVersion(currentVersion.updatedAt)).count > 0;
        }
        // A concurrent load/admin may have created this symbol since the read. Never replace it.
        await prisma.stockAnalysisCache.create({ data: { symbol: sym, payload: plain } });
        return true;
      },
      {
        attempts: PRISMA_CACHE_ATTEMPTS,
        timeoutMs: PRISMA_CACHE_TIMEOUT_MS,
        label: `cache write ${sym}`,
        retryIf: isTransientPrismaError,
        delayMs: 150,
      },
    );
    logLoadStep(sym, "cache_write", t0, persisted ? undefined : "newer cache retained");
  } catch (e) {
    console.warn(
      `[stock-load] ${sym} cache write skipped:`,
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Fresh fundamentals: FMP (pre-normalized, when FMP_API_KEY is set) → SEC EDGAR
 * (as-reported) → Gemini (last resort). Then Yahoo merge + gap-fill; curated
 * sources are authoritative over Yahoo (fill-gaps mode).
 */
async function fetchFreshFundamentals(
  sym: string,
  opts: LoadStockAnalysisOptions | undefined,
): Promise<{ bundle: StockAnalysisBundle; source: FundamentalsSource }> {
  const yahooPromise = fetchYahooWithDeadline(sym);
  let source: FundamentalsSource = "gemini";
  let bundle: StockAnalysisBundle | null = null;

  if (fmpApiKey()) {
    opts?.onProgress?.({ kind: "fmp" });
    const t0 = Date.now();
    bundle = await fetchStockBundleFromFmp(sym);
    logLoadStep(sym, "fmp", t0, bundle ? "ok" : "empty");
    if (bundle) source = "fmp";
    else console.warn(`[fundamentals] ${sym}: FMP key set but no usable data — falling back`);
  }
  if (!bundle) {
    opts?.onProgress?.({ kind: "edgar" });
    const t0 = Date.now();
    bundle = await fetchStockBundleFromEdgar(sym);
    logLoadStep(sym, "edgar", t0, bundle ? "ok" : "empty");
    if (bundle) source = "edgar";
  }
  if (!bundle) {
    bundle = await fetchStockBundleFromGemini(sym, {
      onPartStart: (part) => opts?.onProgress?.({ kind: "gemini", step: part, total: 3 }),
      budgetMs: GEMINI_FULL_BUNDLE_BUDGET_MS,
    });
  }
  console.log(`[fundamentals] ${sym}: source=${source}`);
  await enrichFundamentalsPipeline(bundle, sym, await yahooPromise, {
    onProgress: opts?.onProgress,
    mergeMode: source === "gemini" ? "prefer-yahoo" : "fill-gaps",
  });
  markFundamentalsSource(bundle, source);
  return { bundle, source };
}

async function refreshLivePrices(bundle: StockAnalysisBundle, sym: string): Promise<void> {
  const t0 = Date.now();
  const controller = new AbortController();
  try {
    await mutateWithinTimeout(
      bundle,
      (working) => enrichBundleWithYahooPrices(working, controller.signal),
      YAHOO_STEP_TIMEOUT_MS,
      `yahoo prices ${sym}`,
    );
  } finally {
    controller.abort();
  }
  logLoadStep(sym, "yahoo_prices", t0);
}

async function reconcileDisplayCurrency(bundle: StockAnalysisBundle, sym: string): Promise<void> {
  const controller = new AbortController();
  try {
    await mutateWithinTimeout(bundle, (working) => reconcileFundamentalsCurrency(working, controller.signal), 8_000, `fx reconcile ${sym}`);
  } finally {
    controller.abort();
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
  const loadStarted = Date.now();
  opts?.onProgress?.({ kind: "start" });

  try {
    const tCache = Date.now();
    const row = await readStockCache(sym);
    const readVersion = cacheReadVersion(row);
    logLoadStep(sym, "cache_read", tCache, row ? "hit" : "miss");
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
      await refreshLivePrices(working, sym);
      if (overlay) {
        const tagged = working as StockAnalysisBundle & {
          __financialCurrency?: string;
          __displayFundamentalsCurrency?: string;
        };
        const nativeCurrency = tagged.__financialCurrency;
        applyAdminOverlay(working, overlay);
        tagged.__financialCurrency = overlay.investor.financialCurrency ?? nativeCurrency ?? overlay.investor.currency;
        tagged.__displayFundamentalsCurrency = tagged.__financialCurrency;
      }
      await persistStockCache(sym, working, {
        adminEditedAt,
        adminOverlay: overlay ?? undefined,
        lastFullFetchAt,
      }, readVersion, due && overlay != null);
      await reconcileDisplayCurrency(working, sym);
      logLoadStep(sym, "total", loadStarted);
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
        const refreshYahoo = yahooFundamentalsAreDue(cachedPayload);
        const runGapFill = gapFillIsDue(cachedPayload);
        if (refreshYahoo || runGapFill) {
          await enrichFundamentalsPipeline(bundle, sym, undefined, {
            onProgress: opts?.onProgress,
            runGapFill,
            skipYahooRefresh: !refreshYahoo,
            mergeMode: readFundamentalsSource(cachedPayload) === "gemini" ? "prefer-yahoo" : "fill-gaps",
          });
        }
        opts?.onProgress?.({ kind: "yahoo_prices" });
        await refreshLivePrices(bundle, sym);
        await persistStockCache(sym, bundle, {
          lastFullFetchAt: cachedPayload.__lastFullFetchAt ?? row.updatedAt.toISOString(),
        }, readVersion);
        // Persisted in native currency; convert to the quote currency for display.
        await reconcileDisplayCurrency(bundle, sym);
        logLoadStep(sym, "total", loadStarted);
        return { bundle, error: null };
      }
    }

    const { bundle } = await fetchFreshFundamentals(sym, opts);
    opts?.onProgress?.({ kind: "yahoo_prices" });
    await refreshLivePrices(bundle, sym);
    await persistStockCache(sym, bundle, { lastFullFetchAt: new Date().toISOString() }, readVersion, true);
    await reconcileDisplayCurrency(bundle, sym);
    logLoadStep(sym, "total", loadStarted);
    return { bundle, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load stock data.";
    logLoadStep(sym, "error", loadStarted, message.slice(0, 120));
    return { bundle: null, error: message };
  }
}
