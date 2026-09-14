import type { Trading212Environment } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { normalizeIsoDateString } from "@/lib/format";
import { decryptSecret } from "@/lib/portfolioEncryption";
import { prisma } from "@/lib/prisma";
import type { QtyEvent } from "@/lib/portfolioValueHistory";
import { t212TickerToYahoo } from "@/lib/t212Ticker";
import {
  fetchT212HistoryOrders,
  type T212HistoryOrderItem,
  type T212PaginatedFetchResult,
} from "@/lib/trading212Client";

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
};

export type T212OrdersCacheRead = {
  items: T212HistoryOrderItem[];
  cachedAt: string | null;
  partial: boolean;
  error: string | null;
};

export function parseCachedOrderItems(raw: unknown): T212HistoryOrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw as T212HistoryOrderItem[];
}

export function readT212OrdersCache(conn: T212OrdersCacheFields | null): T212OrdersCacheRead {
  if (!conn?.ordersCache) {
    return { items: [], cachedAt: null, partial: false, error: conn?.ordersCacheError ?? null };
  }
  return {
    items: parseCachedOrderItems(conn.ordersCache),
    cachedAt: conn.ordersCachedAt?.toISOString() ?? null,
    partial: conn.ordersCachePartial,
    error: conn.ordersCacheError ?? null,
  };
}

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function isT212OrdersCacheStale(cachedAt: Date | null | undefined): boolean {
  if (!cachedAt) return true;
  return Date.now() - cachedAt.getTime() > STALE_MS;
}

export async function refreshT212OrdersCache(input: {
  userId: string;
  environment: Trading212Environment;
  apiKeyEnc: string;
  apiSecretEnc: string;
  maxPages?: number;
}): Promise<T212PaginatedFetchResult<T212HistoryOrderItem>> {
  const apiKey = decryptSecret(input.apiKeyEnc);
  const apiSecret = decryptSecret(input.apiSecretEnc);
  const result = await fetchT212HistoryOrders(input.environment, apiKey, apiSecret, {
    maxPages: input.maxPages ?? 6,
  });

  const prev = await prisma.trading212Connection.findUnique({
    where: { userId: input.userId },
    select: {
      ordersCache: true,
      ordersCachedAt: true,
      ordersCachePartial: true,
      ordersCacheError: true,
    },
  });
  const prevItems = parseCachedOrderItems(prev?.ordersCache);
  const merged = mergeT212OrderItems(prevItems, result.items);
  const items = merged.length > 0 ? merged : result.items;

  await prisma.trading212Connection.update({
    where: { userId: input.userId },
    data: {
      ordersCache: items as Prisma.InputJsonValue,
      ordersCachedAt: new Date(),
      ordersCachePartial: result.partial,
      ordersCacheError: result.error ?? null,
    },
  });

  return { items, partial: result.partial, error: result.error };
}
