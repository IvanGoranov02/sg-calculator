import type { Trading212Connection, Trading212Environment } from "@prisma/client";

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

function parseCachedItems(raw: unknown): T212HistoryDividendItem[] {
  if (!Array.isArray(raw)) return [];
  return raw as T212HistoryDividendItem[];
}

export function readT212DividendsCache(conn: Pick<
  Trading212Connection,
  "dividendsCache" | "dividendsCachedAt" | "dividendsCacheError" | "dividendsCachePartial"
> | null): T212DividendsCacheRead {
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
    select: { dividendsCache: true },
  });
  const merged =
    result.items.length > 0
      ? result.items
      : parseCachedItems(prev?.dividendsCache);

  await prisma.trading212Connection.update({
    where: { userId: input.userId },
    data: {
      dividendsCache: merged,
      dividendsCachedAt: new Date(),
      dividendsCachePartial: result.partial,
      dividendsCacheError: result.error ?? null,
    },
  });

  return { ...result, items: merged };
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
      return {
        items: result.items,
        cachedAt: new Date().toISOString(),
        partial: result.partial,
        error: result.error ?? null,
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
