import type { Trading212Connection, Trading212Environment } from "@prisma/client";

/** Cache columns on Trading212Connection — explicit shape avoids stale Prisma client type errors on Preview. */
export type T212DividendsCacheFields = {
  dividendsCache: unknown;
  dividendsCachedAt: Date | null;
  dividendsCacheError: string | null;
  dividendsCachePartial: boolean;
};

import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/portfolioEncryption";
import {
  fetchT212HistoryDividends,
  type T212HistoryDividendItem,
  type T212PaginatedFetchResult,
} from "@/lib/trading212Client";

export type T212DividendsCacheRead = {
  items: T212HistoryDividendItem[];
  cachedAt: string | null;
  partial: boolean;
  error: string | null;
};

export function t212DividendPaymentKey(item: T212HistoryDividendItem): string {
  const ticker = typeof item.ticker === "string" ? item.ticker.trim() : "";
  const paidOn = typeof item.paidOn === "string" ? item.paidOn.trim() : "";
  const amount = item.amount != null ? String(item.amount) : "";
  const currency =
    typeof item.currency === "string" ? item.currency.trim().toUpperCase().slice(0, 8) : "";
  return `${ticker}|${paidOn}|${amount}|${currency}`;
}

/** Union by stable payment key — never drops previously cached rows. */
export function mergeT212DividendItems(
  prev: T212HistoryDividendItem[],
  incoming: T212HistoryDividendItem[],
): T212HistoryDividendItem[] {
  const map = new Map<string, T212HistoryDividendItem>();
  for (const item of prev) map.set(t212DividendPaymentKey(item), item);
  for (const item of incoming) map.set(t212DividendPaymentKey(item), item);
  return [...map.values()].sort((a, b) => {
    const ta = Date.parse(a.paidOn ?? "") || 0;
    const tb = Date.parse(b.paidOn ?? "") || 0;
    return tb - ta;
  });
}

export type T212DividendsCacheWriteDecision = {
  items: T212HistoryDividendItem[];
  partial: boolean;
  error: string | null;
  replaced: boolean;
};

/** Decide what to persist without shrinking a fuller cache on partial/truncated fetches. */
export function decideT212DividendsCacheWrite(
  prevItems: T212HistoryDividendItem[],
  fetch: T212PaginatedFetchResult<T212HistoryDividendItem>,
): T212DividendsCacheWriteDecision {
  if (fetch.items.length === 0 && fetch.partial) {
    return {
      items: prevItems,
      partial: true,
      error: fetch.error ?? "Trading 212 dividend fetch returned no rows.",
      replaced: false,
    };
  }

  const merged = mergeT212DividendItems(prevItems, fetch.items);

  if (fetch.partial) {
    return {
      items: merged,
      partial: true,
      error: fetch.error ?? null,
      replaced: merged.length > prevItems.length,
    };
  }

  if (prevItems.length === 0 || fetch.items.length >= prevItems.length) {
    return {
      items: merged,
      partial: false,
      error: null,
      replaced: true,
    };
  }

  return {
    items: merged,
    partial: true,
    error:
      fetch.error ??
      "Trading 212 returned fewer dividend rows than cache; kept merged history.",
    replaced: false,
  };
}

function parseCachedItems(raw: unknown): T212HistoryDividendItem[] {
  if (!Array.isArray(raw)) return [];
  return raw as T212HistoryDividendItem[];
}

export function readT212DividendsCache(conn: T212DividendsCacheFields | null): T212DividendsCacheRead {
  if (!conn?.dividendsCache) {
    return { items: [], cachedAt: null, partial: false, error: conn?.dividendsCacheError ?? null };
  }
  return {
    items: parseCachedItems(conn.dividendsCache),
    cachedAt: conn.dividendsCachedAt?.toISOString() ?? null,
    partial: conn.dividendsCachePartial,
    error: conn.dividendsCacheError ?? null,
  };
}

export async function refreshT212DividendsCache(input: {
  userId: string;
  environment: Trading212Environment;
  apiKeyEnc: string;
  apiSecretEnc: string;
  maxPages?: number;
}): Promise<T212PaginatedFetchResult<T212HistoryDividendItem>> {
  const apiKey = decryptSecret(input.apiKeyEnc);
  const apiSecret = decryptSecret(input.apiSecretEnc);
  const result = await fetchT212HistoryDividends(input.environment, apiKey, apiSecret, {
    maxPages: input.maxPages ?? 6,
  });

  const prev = await prisma.trading212Connection.findUnique({
    where: { userId: input.userId },
    select: {
      dividendsCache: true,
      dividendsCachedAt: true,
      dividendsCachePartial: true,
      dividendsCacheError: true,
    },
  });
  const prevItems = parseCachedItems(prev?.dividendsCache);
  const decision = decideT212DividendsCacheWrite(prevItems, result);

  const shouldTouchCachedAt =
    decision.replaced || prevItems.length === 0 || decision.items.length > prevItems.length;

  await prisma.trading212Connection.update({
    where: { userId: input.userId },
    data: {
      dividendsCache: decision.items,
      dividendsCachedAt: shouldTouchCachedAt ? new Date() : (prev?.dividendsCachedAt ?? new Date()),
      dividendsCachePartial: decision.partial,
      dividendsCacheError: decision.error,
    },
  });

  return {
    items: decision.items,
    partial: decision.partial,
    error: decision.error ?? undefined,
  };
}

export async function loadT212DividendsForUser(
  userId: string,
  conn: Trading212Connection | null,
  opts: { refresh: boolean },
): Promise<T212DividendsCacheRead & { fetchError?: string }> {
  if (!conn) {
    return { items: [], cachedAt: null, partial: false, error: null };
  }

  if (opts.refresh) {
    try {
      const result = await refreshT212DividendsCache({
        userId,
        environment: conn.environment,
        apiKeyEnc: conn.apiKeyEnc,
        apiSecretEnc: conn.apiSecretEnc,
      });
      const updated = await prisma.trading212Connection.findUnique({
        where: { userId },
        select: {
          dividendsCache: true,
          dividendsCachedAt: true,
          dividendsCachePartial: true,
          dividendsCacheError: true,
        },
      });
      const read = readT212DividendsCache(updated);
      return {
        items: result.items,
        cachedAt: read.cachedAt,
        partial: result.partial,
        error: result.error ?? read.error,
      };
    } catch (e) {
      const cached = readT212DividendsCache(conn);
      const msg = e instanceof Error ? e.message.slice(0, 500) : "Could not refresh Trading 212 dividends";
      if (cached.items.length > 0) {
        return { ...cached, fetchError: msg };
      }
      return { items: [], cachedAt: cached.cachedAt, partial: true, error: msg, fetchError: msg };
    }
  }

  return readT212DividendsCache(conn);
}
