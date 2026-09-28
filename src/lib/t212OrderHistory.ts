import type { Trading212Environment } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { normalizeIsoDateString } from "@/lib/format";
import { decryptSecret } from "@/lib/portfolioEncryption";
import { prisma } from "@/lib/prisma";
import type { QtyEvent } from "@/lib/portfolioValueHistory";
import { t212TickerToYahoo } from "@/lib/t212Ticker";
import {
  fetchT212HistoryOrders,
  normalizeT212OrdersResumePath,
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

export function t212OrderItemKey(item: T212HistoryOrderItem): string {
  const ticker = (item.order?.ticker ?? item.order?.instrument?.ticker ?? "").trim();
  const filledAt = item.fill?.filledAt ?? item.order?.createdAt ?? "";
  const qty = item.fill?.quantity ?? item.order?.filledQuantity ?? item.order?.quantity ?? "";
  const side = (item.order?.side ?? "").trim().toUpperCase();
  return `${ticker}|${filledAt}|${qty}|${side}`;
}

export function mergeT212OrderItems(
  prev: T212HistoryOrderItem[],
  incoming: T212HistoryOrderItem[],
): T212HistoryOrderItem[] {
  const map = new Map<string, T212HistoryOrderItem>();
  for (const item of prev) map.set(t212OrderItemKey(item), item);
  for (const item of incoming) map.set(t212OrderItemKey(item), item);
  return [...map.values()];
}

export function mapT212OrderItemsToQtyEvents(items: T212HistoryOrderItem[]): QtyEvent[] {
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

    out.push({
      symbolYahoo: t212TickerToYahoo(ticker),
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
};

/**
 * Refresh re-probes `history:orders` when the stored walk cannot draw the chart
 * (missing scope, empty cache, or a finished walk that does not match positions).
 * A healthy timeline stays put. A partial walk with a resume cursor continues.
 */
export function shouldRebuildOrdersCacheOnRefresh(input: OrdersCacheRefreshDecision): boolean {
  if (!input.userRefresh) return false;
  if (input.scopeDenied) return true;
  if (input.usedQuantityTimeline) return false;
  if (input.ordersPartial && normalizeT212OrdersResumePath(input.nextPagePath)) return false;
  return true;
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

  const merged = mergeT212OrderItems(prevItems, fetch.items);

  if (fetch.partial) {
    return {
      items: merged,
      partial: true,
      error: fetch.error ?? null,
      replaced: merged.length > prevItems.length,
      nextPagePath: fetch.nextPagePath ?? prevNextPagePath,
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
  const resumePath = prev?.ordersCachePartial
    ? normalizeT212OrdersResumePath(prev.ordersCacheNextPath)
    : null;

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

  const decision = decideT212OrdersCacheWrite(prevItems, result, resumePath);

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
