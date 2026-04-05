/**
 * Server-only Trading 212 Public API client (Basic auth).
 * @see https://docs.trading212.com/api
 */

import type { Trading212Environment } from "@prisma/client";

const BASE: Record<Trading212Environment, string> = {
  demo: "https://demo.trading212.com",
  live: "https://live.trading212.com",
};

export type T212Position = {
  averagePricePaid?: number;
  createdAt?: string;
  currentPrice?: number;
  instrument?: { currency?: string; isin?: string; name?: string; ticker?: string };
  quantity?: number;
  quantityAvailableForTrading?: number;
  quantityInPies?: number;
  walletImpact?: {
    currency?: string;
    currentValue?: number;
    fxImpact?: number;
    totalCost?: number;
    unrealizedProfitLoss?: number;
  };
};

export type T212AccountSummary = {
  currency?: string;
  id?: number;
  totalValue?: number;
  cash?: {
    availableToTrade?: number;
    inPies?: number;
    reservedForOrders?: number;
  };
  investments?: { value?: number };
};

export type T212Paginated<T> = {
  items: T[];
  nextPagePath: string | null;
};

export type T212HistoryDividendItem = {
  amount?: number;
  currency?: string;
  grossAmountPerShare?: number;
  ticker?: string;
  paidOn?: string;
};

export type T212RequestError = Error & {
  status?: number;
  rateLimitReset?: number;
};

function buildAuthHeader(apiKey: string, apiSecret: string): string {
  const raw = `${apiKey}:${apiSecret}`;
  const b64 = Buffer.from(raw, "utf8").toString("base64");
  return `Basic ${b64}`;
}

function parseRateLimitReset(headers: Headers): number | undefined {
  const v = headers.get("x-ratelimit-reset");
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n * 1000 : undefined;
}

export async function t212FetchJson<T>(
  environment: Trading212Environment,
  apiKey: string,
  apiSecret: string,
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<{ data: T; headers: Headers }> {
  const base = BASE[environment];
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  const rest = { ...(init ?? {}) } as RequestInit & { timeoutMs?: number };
  const timeoutMs = rest.timeoutMs ?? 25_000;
  delete rest.timeoutMs;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: buildAuthHeader(apiKey, apiSecret),
        ...(rest.headers as Record<string, string>),
      },
    });

    const rateLimitReset = parseRateLimitReset(res.headers);

    if (res.status === 429) {
      const err: T212RequestError = Object.assign(
        new Error("Trading 212 rate limit exceeded. Try again later."),
        { status: 429, rateLimitReset },
      );
      throw err;
    }

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const txt = await res.text();
        if (txt) detail = txt.slice(0, 500);
      } catch {
        /* ignore */
      }
      const err: T212RequestError = Object.assign(new Error(`Trading 212 ${res.status}: ${detail}`), {
        status: res.status,
        rateLimitReset,
      });
      throw err;
    }

    const data = (await res.json()) as T;
    return { data, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

function normalizePositionsPayload(data: unknown): T212Position[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: T212Position[] }).items;
  }
  return [];
}

export async function fetchT212Positions(
  environment: Trading212Environment,
  apiKey: string,
  apiSecret: string,
): Promise<T212Position[]> {
  const { data } = await t212FetchJson<unknown>(
    environment,
    apiKey,
    apiSecret,
    "/api/v0/equity/positions",
  );
  return normalizePositionsPayload(data);
}

export async function fetchT212AccountSummary(
  environment: Trading212Environment,
  apiKey: string,
  apiSecret: string,
): Promise<T212AccountSummary | null> {
  try {
    const { data } = await t212FetchJson<T212AccountSummary>(
      environment,
      apiKey,
      apiSecret,
      "/api/v0/equity/account/summary",
    );
    return data;
  } catch {
    return null;
  }
}

/** Follow nextPagePath until exhausted (dividends, orders, etc.). */
export async function fetchAllT212Paginated<T>(
  environment: Trading212Environment,
  apiKey: string,
  apiSecret: string,
  initialPath: string,
  options?: { maxPages?: number },
): Promise<T[]> {
  const maxPages = options?.maxPages ?? 200;
  const out: T[] = [];
  let path: string | null = initialPath.includes("?")
    ? initialPath
    : `${initialPath}?limit=50`;
  let pages = 0;

  while (path && pages < maxPages) {
    const result = await t212FetchJson<T212Paginated<T>>(environment, apiKey, apiSecret, path);
    const page: T212Paginated<T> = result.data;
    pages += 1;
    if (Array.isArray(page.items)) {
      out.push(...page.items);
    }
    path = page.nextPagePath;
  }

  return out;
}
