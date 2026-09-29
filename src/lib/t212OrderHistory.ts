import type { Trading212Environment } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { normalizeIsoDateString } from "@/lib/format";
import { decryptSecret } from "@/lib/portfolioEncryption";
import { prisma } from "@/lib/prisma";
import type { QtyEvent } from "@/lib/portfolioValueHistory";
import { t212TickerToYahoo } from "@/lib/t212Ticker";
import {
  fetchT212HistoryOrders,
  isOrdersLimit10RestartPath,
  isOrdersLimit10WalkPath,
  normalizeT212OrdersResumePath,
  ordersResumeInLimit10Walk,
  oldestT212HistoryCursorMs,
  ordersHistoryPathBase,
  ordersNextPathAvoidingSkip,
  ordersPathWithCursor,
  T212_ORDERS_LIMIT10_RESTART_PATH,
  t212HistoryPageLimit,
  t212OrderItemKey,
  t212PathCursor,
  tagOrdersLimit10WalkPath,
  stripOrdersLimit10WalkMarker,
  type T212HistoryOrderItem,
  type T212PaginatedFetchResult,
} from "@/lib/trading212Client";

/** Stored only when the first history page 403s and there are no cached fills yet. */
export const T212_ORDERS_SCOPE_DENIED = "scope:history:orders:denied";

const FILLED_STATUS = new Set(["FILLED", "PARTIALLY_FILLED"]);
const SKIP_STATUS = new Set(["CANCELLED", "REJECTED", "LOCAL", "UNCONFIRMED"]);
const SHARE_ADD_FILL_TYPES = new Set([
  "STOCK_SPLIT",
  "STOCK_DISTRIBUTION",
  "CUSTOM_STOCK_DISTRIBUTION",
  "EQUITY_RIGHTS",
  "SCRIP_STOCK_DIVIDENDS",
  "STOCK_DIVIDENDS",
  "STOCK_ACQUISITION",
  "CASH_AND_STOCK_ACQUISITION",
  "SPIN_OFF",
  "FOP",
  "FOP_CORRECTION",
]);

export { t212OrderItemKey };

export function mergeT212OrderItems(
  prev: T212HistoryOrderItem[],
  incoming: T212HistoryOrderItem[],
): T212HistoryOrderItem[] {
  const map = new Map<string, T212HistoryOrderItem>();
  for (const item of prev) map.set(t212OrderItemKey(item), item);
  for (const item of incoming) map.set(t212OrderItemKey(item), item);
  return [...map.values()];
}

/** Stored Yahoo key for each T212 ticker, including disambiguated collisions. */
export function t212HoldingSymbolMap(
  holdings: { symbolYahoo: string; symbolT212?: string | null }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const h of holdings) {
    const ticker = h.symbolT212?.trim();
    const yahoo = h.symbolYahoo.trim().toUpperCase();
    if (!ticker || !yahoo) continue;
    map.set(ticker.toUpperCase(), yahoo);
  }
  return map;
}

/**
 * A resumed page that only repeats fills already cached is why Refresh stays on
 * "Loading earlier months" with a single bar. Step the cursor 1ms behind the
 * oldest cached fill so the next poll moves. A cursor that is already behind
 * those fills (a skip rewind) and the cursor-less limit=10 restart are kept.
 */
export function resumeCursorAfterDuplicatePage(input: {
  prevItems: T212HistoryOrderItem[];
  fetchedItems: T212HistoryOrderItem[];
  nextPagePath: string | null;
  resumePath: string | null;
}): string | null {
  const next = input.nextPagePath;
  if (!input.resumePath?.trim() || !next?.trim()) return next;
  if (isOrdersLimit10RestartPath(next)) return next;
  const prevKeys = new Set(input.prevItems.map((item) => t212OrderItemKey(item)));
  if (input.fetchedItems.some((item) => !prevKeys.has(t212OrderItemKey(item)))) return next;
  if (input.prevItems.length === 0) return next;
  const oldest = oldestT212HistoryCursorMs(input.prevItems);
  if (oldest == null) return next;
  const bare = stripOrdersLimit10WalkMarker(next) ?? next;
  const apiMs = Number(t212PathCursor(bare));
  if (Number.isFinite(apiMs) && apiMs < oldest) return next;
  const stepped = ordersPathWithCursor(bare, oldest - 1);
  return isOrdersLimit10WalkPath(next) ? tagOrdersLimit10WalkPath(stepped) : stepped;
}

/**
 * A saved resume cursor older than every cached fill already skipped a block.
 * Continue from the oldest fill we actually have. A cursor at or after that fill,
 * and the cursor-less limit=10 restart, stay as stored.
 */
export function rewindSkippedOrdersResumePath(
  items: T212HistoryOrderItem[],
  nextPath: string | null,
): string | null {
  if (!nextPath?.trim()) return nextPath;
  const marked = isOrdersLimit10WalkPath(nextPath);
  const bare = stripOrdersLimit10WalkMarker(nextPath);
  if (!bare) return nextPath;
  // The page that produced this cursor is not the cursor itself. Passing the
  // skipped cursor as the request would step backward inside the gap.
  const fixed = ordersNextPathAvoidingSkip({
    requestedPath: `${ordersHistoryPathBase(bare)}?limit=${t212HistoryPageLimit(bare)}`,
    pageItems: items,
    nextPagePath: bare,
  });
  if (!fixed || fixed === bare) return nextPath;
  return marked ? tagOrdersLimit10WalkPath(fixed) : fixed;
}

export function mapT212OrderItemsToQtyEvents(
  items: T212HistoryOrderItem[],
  holdingSymbolByT212?: ReadonlyMap<string, string>,
): QtyEvent[] {
  const out: QtyEvent[] = [];
  for (const item of items) {
    const order = item.order;
    const fill = item.fill;
    const status = (order?.status ?? "").trim().toUpperCase();
    if (SKIP_STATUS.has(status)) continue;
    if (status && !FILLED_STATUS.has(status) && fill?.quantity == null) continue;

    const ticker = (order?.ticker ?? order?.instrument?.ticker ?? "").trim();
    if (!ticker) continue;

    const date = normalizeIsoDateString(fill?.filledAt ?? order?.createdAt ?? "");
    if (!date) continue;

    const rawQty = Number(fill?.quantity ?? order?.filledQuantity ?? order?.quantity ?? 0);
    if (!Number.isFinite(rawQty) || rawQty === 0) continue;

    const fillType = (fill?.type ?? "TRADE").trim().toUpperCase();
    const side = (order?.side ?? "").trim().toUpperCase();
    let delta: number;
    if (SHARE_ADD_FILL_TYPES.has(fillType)) {
      delta = Math.abs(rawQty);
    } else if (side === "SELL") {
      delta = -Math.abs(rawQty);
    } else if (side === "BUY") {
      delta = Math.abs(rawQty);
    } else {
      delta = rawQty;
    }
    if (delta === 0) continue;

    const fromHolding = holdingSymbolByT212?.get(ticker.toUpperCase());
    out.push({
      symbolYahoo: fromHolding ?? t212TickerToYahoo(ticker),
      date,
      delta,
    });
  }
  return out;
}

export type T212OrdersCacheFields = {
  ordersCache: unknown;
  ordersCachedAt: Date | null;
  ordersCacheError: string | null;
  ordersCachePartial: boolean;
  ordersCacheNextPath?: string | null;
};

export type T212OrdersCacheRead = {
  items: T212HistoryOrderItem[];
  cachedAt: string | null;
  partial: boolean;
  error: string | null;
  nextPagePath: string | null;
};

export function parseCachedOrderItems(raw: unknown): T212HistoryOrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw as T212HistoryOrderItem[];
}

export function readT212OrdersCache(conn: T212OrdersCacheFields | null): T212OrdersCacheRead {
  if (!conn?.ordersCache) {
    return {
      items: [],
      cachedAt: null,
      partial: false,
      error: conn?.ordersCacheError ?? null,
      nextPagePath: conn?.ordersCacheNextPath ?? null,
    };
  }
  return {
    items: parseCachedOrderItems(conn.ordersCache),
    cachedAt: conn.ordersCachedAt?.toISOString() ?? null,
    partial: conn.ordersCachePartial,
    error: conn.ordersCacheError ?? null,
    nextPagePath: conn.ordersCacheNextPath ?? null,
  };
}

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

/** True only for the explicit first-page marker. Generic 403 copy is also used for IP allowlists and later pages. */
export function isT212OrdersScopeDenied(error: string | null | undefined): boolean {
  return Boolean(error?.includes(T212_ORDERS_SCOPE_DENIED));
}

/**
 * Missing `history:orders` only when this call is the first page, returned no rows, and nothing is cached yet.
 * A 403 while resuming must not wipe fills already stored.
 */
export function shouldRecordOrdersScopeDenial(input: {
  prevItemCount: number;
  resumePath: string | null;
  fetchItemCount: number;
  httpStatus?: number;
}): boolean {
  if (input.prevItemCount > 0) return false;
  if (input.resumePath) return false;
  if (input.fetchItemCount > 0) return false;
  return input.httpStatus === 403;
}

export type OrdersCacheGeneration = {
  apiKeyEnc: string;
  environment: Trading212Environment;
  ordersCachedAt: Date | null;
  ordersCacheNextPath: string | null;
  ordersCachePartial: boolean;
  ordersCacheError: string | null;
};

/** Where-clause for the cache write. A clear or a newer walk changes one of these fields, so the update matches 0 rows. */
export function ordersCacheGenerationWhere(userId: string, generation: OrdersCacheGeneration) {
  return {
    userId,
    apiKeyEnc: generation.apiKeyEnc,
    environment: generation.environment,
    ordersCachedAt: generation.ordersCachedAt,
    ordersCacheNextPath: generation.ordersCacheNextPath,
    ordersCachePartial: generation.ordersCachePartial,
    ordersCacheError: generation.ordersCacheError,
  };
}

/** Compare-and-swap snapshot. A credential clear or a newer walk changes one of these fields. */
export function ordersCacheGenerationUnchanged(
  expected: OrdersCacheGeneration,
  current: OrdersCacheGeneration,
): boolean {
  return (
    expected.apiKeyEnc === current.apiKeyEnc &&
    expected.environment === current.environment &&
    expected.ordersCachePartial === current.ordersCachePartial &&
    (expected.ordersCacheError ?? null) === (current.ordersCacheError ?? null) &&
    (expected.ordersCacheNextPath ?? null) === (current.ordersCacheNextPath ?? null) &&
    (expected.ordersCachedAt?.getTime() ?? null) === (current.ordersCachedAt?.getTime() ?? null)
  );
}

/** Clear fills when a new key is saved or demo/live changes. A no-op environment save must not. */
export function trading212SettingsOrdersCachePatch(input: {
  savingCredentials: boolean;
  environmentChanged: boolean;
}): ReturnType<typeof clearedT212OrdersCacheData> | null {
  if (input.savingCredentials || input.environmentChanged) return clearedT212OrdersCacheData();
  return null;
}

/** Drop cached fills when the API key or environment changes so history is rebuilt. */
export function clearedT212OrdersCacheData(): Pick<
  Prisma.Trading212ConnectionUpdateInput,
  "ordersCache" | "ordersCachedAt" | "ordersCacheError" | "ordersCachePartial" | "ordersCacheNextPath"
> {
  return {
    ordersCache: Prisma.DbNull,
    ordersCachedAt: null,
    ordersCacheError: null,
    ordersCachePartial: false,
    ordersCacheNextPath: null,
  };
}

/** Partial caches stay retryable until pagination completes. */
export function isT212OrdersCacheStale(
  cachedAt: Date | null | undefined,
  partial?: boolean,
): boolean {
  if (partial) return true;
  if (!cachedAt) return true;
  return Date.now() - cachedAt.getTime() > STALE_MS;
}

export type OrdersCacheRefreshDecision = {
  /** True only for the portfolio Refresh control, not page load or backfill polls. */
  userRefresh: boolean;
  scopeDenied: boolean;
  ordersPartial: boolean;
  nextPagePath: string | null;
  /** This cache already reconstructs months that match open positions. */
  usedQuantityTimeline: boolean;
  /** Those months start before the current calendar month. */
  timelineCoversEarlierMonth: boolean;
};

/**
 * Refresh re-probes `history:orders` when the stored walk cannot draw earlier months
 * (missing scope, empty cache, a finished walk that does not match positions,
 * or a finished walk whose fills only cover the current month).
 * A timeline that already matches and starts before this month stays put.
 * A partial walk with a resume cursor continues.
 */
export function shouldRebuildOrdersCacheOnRefresh(input: OrdersCacheRefreshDecision): boolean {
  if (!input.userRefresh) return false;
  if (input.scopeDenied) return true;
  if (input.usedQuantityTimeline && input.timelineCoversEarlierMonth) return false;
  if (input.ordersPartial && normalizeT212OrdersResumePath(input.nextPagePath)) return false;
  return true;
}

/**
 * A resumed limit=50 cursor (epoch millis of the oldest fill) that comes back empty
 * is poisoned, including the limit=10 retry of that same cursor. Restart at limit=10
 * with no cursor. A cursor saved during that walk, or a cursor-less walk that already
 * returned fills, is a real end — do not start limit=50 again.
 */
export function stalledOrdersResumeFallback(input: {
  prevItems: T212HistoryOrderItem[];
  resumePath: string | null;
  fetchedItems: T212HistoryOrderItem[];
  fetchPartial: boolean;
}): string | null {
  if (!input.resumePath || input.fetchPartial) return null;
  if (isOrdersLimit10WalkPath(input.resumePath)) return null;

  const oldestPrev = oldestT212HistoryCursorMs(input.prevItems);
  const fetchedOlder =
    oldestPrev != null &&
    input.fetchedItems.some((item) => {
      const ms = oldestT212HistoryCursorMs([item]);
      return ms != null && ms < oldestPrev;
    });
  if (fetchedOlder) return null;
  if (input.fetchedItems.length > 0 && oldestPrev == null) return null;

  if (isOrdersLimit10RestartPath(input.resumePath)) {
    if (input.fetchedItems.length === 0) return T212_ORDERS_LIMIT10_RESTART_PATH;
    return null;
  }

  const cursor = t212PathCursor(input.resumePath);
  const poisonedTimestamp =
    input.fetchedItems.length === 0 &&
    cursor != null &&
    oldestPrev != null &&
    cursor === String(oldestPrev);
  const limit50FalseEnd =
    input.fetchedItems.length === 0 && t212HistoryPageLimit(input.resumePath) > 10;
  if (poisonedTimestamp || limit50FalseEnd) return T212_ORDERS_LIMIT10_RESTART_PATH;
  return null;
}

export type T212OrdersCacheWriteDecision = {
  items: T212HistoryOrderItem[];
  partial: boolean;
  error: string | null;
  replaced: boolean;
  nextPagePath: string | null;
};

/** Decide what to persist without shrinking cache or blocking retries on partial pulls. */
export function decideT212OrdersCacheWrite(
  prevItems: T212HistoryOrderItem[],
  fetch: T212PaginatedFetchResult<T212HistoryOrderItem>,
  prevNextPagePath: string | null,
): T212OrdersCacheWriteDecision {
  const resumingOlderPages = Boolean(prevNextPagePath?.trim());

  if (fetch.items.length === 0 && fetch.partial) {
    return {
      items: prevItems,
      partial: true,
      error: fetch.error ?? "Trading 212 order fetch returned no rows.",
      replaced: false,
      nextPagePath: fetch.nextPagePath ?? prevNextPagePath,
    };
  }

  const stalled = stalledOrdersResumeFallback({
    prevItems,
    resumePath: prevNextPagePath,
    fetchedItems: fetch.items,
    fetchPartial: fetch.partial,
  });
  if (stalled) {
    return {
      items: mergeT212OrderItems(prevItems, fetch.items),
      partial: true,
      error: null,
      replaced: false,
      nextPagePath: stalled,
    };
  }

  const merged = mergeT212OrderItems(prevItems, fetch.items);

  if (fetch.partial) {
    return {
      items: merged,
      partial: true,
      error: fetch.error ?? null,
      replaced: merged.length > prevItems.length,
      nextPagePath: resumeCursorAfterDuplicatePage({
        prevItems,
        fetchedItems: fetch.items,
        nextPagePath: fetch.nextPagePath ?? prevNextPagePath,
        resumePath: prevNextPagePath,
      }),
    };
  }

  if (resumingOlderPages) {
    return {
      items: merged,
      partial: false,
      error: null,
      replaced: true,
      nextPagePath: null,
    };
  }

  if (prevItems.length === 0 || fetch.items.length >= prevItems.length) {
    return {
      items: merged,
      partial: false,
      error: null,
      replaced: true,
      nextPagePath: null,
    };
  }

  return {
    items: merged,
    partial: true,
    error:
      fetch.error ??
      "Trading 212 returned fewer order rows than cache; kept merged history.",
    replaced: false,
    nextPagePath: null,
  };
}

export async function refreshT212OrdersCache(input: {
  userId: string;
  environment: Trading212Environment;
  apiKeyEnc: string;
  apiSecretEnc: string;
  maxPages?: number;
  minRequestIntervalMs?: number;
}): Promise<T212PaginatedFetchResult<T212HistoryOrderItem>> {
  const apiKey = decryptSecret(input.apiKeyEnc);
  const apiSecret = decryptSecret(input.apiSecretEnc);

  const prev = await prisma.trading212Connection.findUnique({
    where: { userId: input.userId },
    select: {
      apiKeyEnc: true,
      environment: true,
      ordersCache: true,
      ordersCachedAt: true,
      ordersCachePartial: true,
      ordersCacheError: true,
      ordersCacheNextPath: true,
    },
  });
  const prevItems = parseCachedOrderItems(prev?.ordersCache);
  const storedNextPath = prev?.ordersCachePartial ? (prev.ordersCacheNextPath ?? null) : null;
  const rawNextPath = rewindSkippedOrdersResumePath(prevItems, storedNextPath);
  const resumePath = normalizeT212OrdersResumePath(rawNextPath);

  const generation: OrdersCacheGeneration = {
    apiKeyEnc: input.apiKeyEnc,
    environment: input.environment,
    ordersCachedAt: prev?.ordersCachedAt ?? null,
    ordersCacheNextPath: prev?.ordersCacheNextPath ?? null,
    ordersCachePartial: prev?.ordersCachePartial ?? false,
    ordersCacheError: prev?.ordersCacheError ?? null,
  };

  const result = await fetchT212HistoryOrders(input.environment, apiKey, apiSecret, {
    maxPages: input.maxPages ?? 6,
    minRequestIntervalMs: input.minRequestIntervalMs ?? 400,
    startPath: resumePath,
    limit10Walk: ordersResumeInLimit10Walk(rawNextPath),
  });

  async function commitIfCurrent(data: Prisma.Trading212ConnectionUpdateInput): Promise<boolean> {
    const updated = await prisma.trading212Connection.updateMany({
      where: ordersCacheGenerationWhere(input.userId, generation),
      data,
    });
    return updated.count > 0;
  }

  async function readCurrentCache(): Promise<T212PaginatedFetchResult<T212HistoryOrderItem>> {
    const fresh = await prisma.trading212Connection.findUnique({
      where: { userId: input.userId },
      select: {
        ordersCache: true,
        ordersCachedAt: true,
        ordersCachePartial: true,
        ordersCacheError: true,
        ordersCacheNextPath: true,
      },
    });
    const read = readT212OrdersCache(fresh);
    return {
      items: read.items,
      partial: read.partial,
      error: read.error ?? undefined,
      nextPagePath: read.nextPagePath,
    };
  }

  if (
    shouldRecordOrdersScopeDenial({
      prevItemCount: prevItems.length,
      resumePath,
      fetchItemCount: result.items.length,
      httpStatus: result.status,
    })
  ) {
    const committed = await commitIfCurrent({
      ordersCache: [],
      ordersCachedAt: null,
      ordersCachePartial: true,
      ordersCacheError: T212_ORDERS_SCOPE_DENIED,
      ordersCacheNextPath: null,
    });
    if (!committed) return readCurrentCache();
    return {
      items: [],
      partial: true,
      error: T212_ORDERS_SCOPE_DENIED,
      nextPagePath: null,
      status: 403,
    };
  }

  const decision = decideT212OrdersCacheWrite(prevItems, result, rawNextPath);

  const shouldTouchCachedAt =
    !decision.partial &&
    (decision.replaced || prevItems.length === 0);

  const committed = await commitIfCurrent({
    ordersCache: decision.items as Prisma.InputJsonValue,
    ordersCachedAt: shouldTouchCachedAt ? new Date() : (prev?.ordersCachedAt ?? null),
    ordersCachePartial: decision.partial,
    ordersCacheError: decision.error,
    ordersCacheNextPath: decision.nextPagePath,
  });
  if (!committed) return readCurrentCache();

  return {
    items: decision.items,
    partial: decision.partial,
    error: decision.error ?? undefined,
    nextPagePath: decision.nextPagePath,
    status: result.status,
  };
}
