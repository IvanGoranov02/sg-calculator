import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

/**
 * Bump when normalizer or prompt changes significantly so stale caches are discarded.
 */
export const CACHE_SCHEMA_VERSION = 10;

/** Rolling window: Gemini fundamentals stay in DB this long before re-fetch. */
export const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type CachePayload = StockAnalysisBundle & {
  __cacheVersion?: number;
  historical?: StockAnalysisBundle["historical"];
  intraday?: StockAnalysisBundle["intraday"];
  eurPerUsd?: StockAnalysisBundle["eurPerUsd"];
};

export function buildCachePayload(bundle: StockAnalysisBundle): object {
  return JSON.parse(
    JSON.stringify({ ...bundle, __cacheVersion: CACHE_SCHEMA_VERSION }),
  ) as object;
}

export function cacheIsFresh(payload: CachePayload, updatedAt: Date): boolean {
  if ((payload.__cacheVersion ?? 0) < CACHE_SCHEMA_VERSION) return false;
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
