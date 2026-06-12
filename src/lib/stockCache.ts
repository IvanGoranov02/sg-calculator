import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

/**
 * Bump when normalizer or prompt changes significantly so stale caches are discarded.
 */
export const CACHE_SCHEMA_VERSION = 10;

/** Rolling window: Gemini fundamentals stay in DB this long before re-fetch. */
export const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Unfillable gaps stay gappy; don't retry the paid Gemini gap-fill on every view. */
export const GAP_FILL_RETRY_MS = 24 * 60 * 60 * 1000;

export type CachePayload = StockAnalysisBundle & {
  __cacheVersion?: number;
  /** Set when an admin saved this payload; protects fundamentals from automatic re-fetch/merge. */
  __adminEditedAt?: string;
  /** Last Gemini gap-fill attempt; carried through persist via the bundle object itself. */
  __gapFillAt?: string;
  /** Where the fundamentals came from; EDGAR data is authoritative over Yahoo on re-merge. */
  __fundamentalsSource?: FundamentalsSource;
  historical?: StockAnalysisBundle["historical"];
  intraday?: StockAnalysisBundle["intraday"];
  eurPerUsd?: StockAnalysisBundle["eurPerUsd"];
};

export type FundamentalsSource = "edgar" | "gemini";

export function markFundamentalsSource(bundle: StockAnalysisBundle, source: FundamentalsSource): void {
  (bundle as CachePayload).__fundamentalsSource = source;
}

export function readFundamentalsSource(payload: CachePayload | null | undefined): FundamentalsSource {
  return payload?.__fundamentalsSource === "edgar" ? "edgar" : "gemini";
}

export function buildCachePayload(
  bundle: StockAnalysisBundle,
  adminEditedAt?: string | null,
): object {
  return JSON.parse(
    JSON.stringify({
      ...bundle,
      __cacheVersion: CACHE_SCHEMA_VERSION,
      __adminEditedAt: adminEditedAt || undefined,
    }),
  ) as object;
}

export function gapFillIsDue(payload: CachePayload | null | undefined): boolean {
  const at = payload?.__gapFillAt;
  if (!at) return true;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t >= GAP_FILL_RETRY_MS;
}

export function markGapFillAttempt(bundle: StockAnalysisBundle): void {
  (bundle as CachePayload).__gapFillAt = new Date().toISOString();
}

export function readAdminEditedAt(payload: CachePayload | null | undefined): string | null {
  if (!payload?.__adminEditedAt) return null;
  if ((payload.__cacheVersion ?? 0) < CACHE_SCHEMA_VERSION) return null;
  return payload.__adminEditedAt;
}

export function cacheIsFresh(payload: CachePayload, updatedAt: Date): boolean {
  if ((payload.__cacheVersion ?? 0) < CACHE_SCHEMA_VERSION) return false;
  // Admin-curated rows never expire on their own; only an explicit admin refresh replaces them.
  if (payload.__adminEditedAt) return true;
  return Date.now() - updatedAt.getTime() < CACHE_MAX_AGE_MS;
}

/** Preserve Yahoo price series from an existing row when admin saves fundamentals only. */
export function mergeAdminEditableIntoCache(
  edited: StockAnalysisBundle,
  existing: CachePayload | null,
): StockAnalysisBundle {
  return {
    ...edited,
    historical: existing?.historical?.length ? existing.historical : [],
    intraday: existing?.intraday ?? edited.intraday,
    eurPerUsd: existing?.eurPerUsd ?? edited.eurPerUsd,
  };
}
