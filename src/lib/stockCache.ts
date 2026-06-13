import type { AdminEditableBundle } from "@/lib/adminCacheSchema";
import type {
  BalanceSheetAnnual,
  CashFlowAnnual,
  IncomeStatementAnnual,
  StockAnalysisBundle,
} from "@/lib/stockAnalysisTypes";
import { sortIncomeByYearAsc, sortQuarterlyByDateAsc } from "@/lib/stockAnalysisTypes";

/**
 * Bump when normalizer or prompt changes significantly so stale caches are discarded.
 * NOTE: admin-curated rows are protected independently of this version (see
 * readAdminEditedAt / cacheIsFresh) — hand-curated data is never auto-discarded.
 */
export const CACHE_SCHEMA_VERSION = 10;

/** Rolling window: auto-sourced fundamentals stay in DB this long before re-fetch. */
export const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Unfillable gaps stay gappy; don't retry the paid Gemini gap-fill on every view. */
export const GAP_FILL_RETRY_MS = 24 * 60 * 60 * 1000;

/** A new earnings report triggers at most one full re-fetch within this window. */
export const EARNINGS_REFRESH_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type CachePayload = StockAnalysisBundle & {
  __cacheVersion?: number;
  /** Set when an admin saved this payload; admin-curated fields are protected forever. */
  __adminEditedAt?: string;
  /**
   * Exact fields an admin approved (keyed by fiscal year / quarter date). Re-applied
   * on top of every fresh fetch so curated values are never overwritten — new periods
   * from later reports still flow in around them.
   */
  __adminOverlay?: AdminEditableBundle;
  /** Last time fundamentals were fully (re)fetched from source — anchors earnings-gated refresh. */
  __lastFullFetchAt?: string;
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

/** Where the displayed report data comes from (admin curation wins); safe on any bundle. */
export function readBundleDataSource(bundle: StockAnalysisBundle): "admin" | "edgar" | "gemini" {
  const p = bundle as CachePayload;
  if (p.__adminEditedAt) return "admin";
  return p.__fundamentalsSource === "edgar" ? "edgar" : "gemini";
}

export type BuildCachePayloadOptions = {
  adminEditedAt?: string | null;
  adminOverlay?: AdminEditableBundle | null;
  lastFullFetchAt?: string | null;
};

export function buildCachePayload(
  bundle: StockAnalysisBundle,
  opts?: string | null | BuildCachePayloadOptions,
): object {
  // Legacy callers pass adminEditedAt as a bare string. The explicit options are
  // authoritative — anything not passed is cleared, so stale flags can't leak through.
  const o: BuildCachePayloadOptions =
    typeof opts === "string" || opts == null ? { adminEditedAt: opts ?? undefined } : opts;
  return JSON.parse(
    JSON.stringify({
      ...bundle,
      __cacheVersion: CACHE_SCHEMA_VERSION,
      __adminEditedAt: o.adminEditedAt || undefined,
      __adminOverlay: o.adminOverlay ?? undefined,
      __lastFullFetchAt: o.lastFullFetchAt || undefined,
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

/**
 * Admin-curated timestamp, if any. Intentionally version-independent: curated data
 * survives schema/prompt bumps (the overlay is re-applied onto the fresh shape).
 */
export function readAdminEditedAt(payload: CachePayload | null | undefined): string | null {
  return payload?.__adminEditedAt || null;
}

export function readAdminOverlay(payload: CachePayload | null | undefined): AdminEditableBundle | null {
  const o = payload?.__adminOverlay;
  return o && typeof o === "object" ? o : null;
}

export function cacheIsFresh(payload: CachePayload, updatedAt: Date): boolean {
  // Admin-curated rows never expire on their own (regardless of schema version);
  // only an explicit admin refresh or a new earnings report replaces them.
  if (payload.__adminEditedAt) return true;
  if ((payload.__cacheVersion ?? 0) < CACHE_SCHEMA_VERSION) return false;
  return Date.now() - updatedAt.getTime() < CACHE_MAX_AGE_MS;
}

/**
 * True when a company's known next-earnings date has passed since our last full
 * fetch — i.e. a new report is out and we should re-fetch. Throttled so we re-fetch
 * at most once per EARNINGS_REFRESH_MIN_INTERVAL_MS even if detection is borderline.
 */
export function earningsReportDue(
  payload: CachePayload | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!payload) return false;
  const earnings = payload.quote?.earningsDate;
  if (!earnings) return false;
  const e = Date.parse(earnings);
  if (!Number.isFinite(e)) return false;

  const anchorStr = payload.__lastFullFetchAt ?? payload.__adminEditedAt;
  const anchor = anchorStr ? Date.parse(anchorStr) : NaN;
  const lastFetch = Number.isFinite(anchor) ? anchor : 0;

  // The known earnings date has passed and it post-dates our last full fetch.
  if (!(e <= nowMs && e > lastFetch)) return false;
  // Don't hammer source APIs around the earnings date.
  if (Number.isFinite(anchor) && nowMs - anchor < EARNINGS_REFRESH_MIN_INTERVAL_MS) return false;
  return true;
}

function overlayRows<T>(fresh: T[], admin: T[], keyOf: (r: T) => string, sort: (rows: T[]) => T[]): T[] {
  const adminByKey = new Map(admin.map((r) => [keyOf(r), r]));
  const freshKeys = new Set(fresh.map(keyOf));
  return sort([
    ...fresh.map((r) => adminByKey.get(keyOf(r)) ?? r),
    ...admin.filter((r) => !freshKeys.has(keyOf(r))),
  ]);
}

const sortByFiscalYearAsc = <T extends { fiscalYear: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => Number(a.fiscalYear) - Number(b.fiscalYear));
const fyKey = (r: { fiscalYear: string }) => r.fiscalYear;
const dateKey = (r: { date: string }) => r.date.slice(0, 10);

/**
 * Re-apply admin-curated values on top of a (freshly fetched, price-enriched) bundle.
 * Admin always wins for any period/field it covers; price history, intraday, FX, live
 * quote price and earnings date are left untouched (they stay live). Mutates `bundle`.
 */
export function applyAdminOverlay(bundle: StockAnalysisBundle, overlay: AdminEditableBundle): void {
  if (overlay.quote?.name) bundle.quote = { ...bundle.quote, name: overlay.quote.name };
  bundle.investor = overlay.investor;
  bundle.income = overlayRows(
    bundle.income,
    overlay.income as IncomeStatementAnnual[],
    fyKey,
    sortIncomeByYearAsc,
  );
  bundle.cashFlow = overlayRows(
    bundle.cashFlow,
    overlay.cashFlow as CashFlowAnnual[],
    fyKey,
    sortByFiscalYearAsc,
  );
  bundle.balanceSheet = overlayRows(
    bundle.balanceSheet,
    overlay.balanceSheet as BalanceSheetAnnual[],
    fyKey,
    sortByFiscalYearAsc,
  );
  bundle.incomeQuarterly = overlayRows(
    bundle.incomeQuarterly,
    overlay.incomeQuarterly,
    dateKey,
    sortQuarterlyByDateAsc,
  );
  bundle.cashFlowQuarterly = overlayRows(
    bundle.cashFlowQuarterly,
    overlay.cashFlowQuarterly,
    dateKey,
    sortQuarterlyByDateAsc,
  );
  bundle.balanceSheetQuarterly = overlayRows(
    bundle.balanceSheetQuarterly,
    overlay.balanceSheetQuarterly,
    dateKey,
    sortQuarterlyByDateAsc,
  );
  bundle.dividendQuarterly = overlayRows(
    bundle.dividendQuarterly,
    overlay.dividendQuarterly,
    dateKey,
    sortQuarterlyByDateAsc,
  );
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
