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

export type T212PaginatedFetchResult<T> = {
  items: T[];
  /** True when pagination stopped early (rate limit, error, or maxPages). */
  partial: boolean;
  error?: string;
};

const T212_MIN_REQUEST_INTERVAL_MS = 10_000;
const T212_429_DEFAULT_BACKOFF_MS = 10_500;
const T212_MAX_429_RETRIES = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

/** Paid-out dividends. Rate limit is 6/min — keep maxPages small. */
export async function fetchT212HistoryDividends(
  environment: Trading212Environment,
  apiKey: string,
  apiSecret: string,
  options?: { maxPages?: number; minRequestIntervalMs?: number },
): Promise<T212PaginatedFetchResult<T212HistoryDividendItem>> {
  return fetchAllT212Paginated<T212HistoryDividendItem>(
    environment,
    apiKey,
    apiSecret,
    "/api/v0/equity/history/dividends",
    {
      maxPages: options?.maxPages ?? 6,
      minRequestIntervalMs: options?.minRequestIntervalMs ?? T212_MIN_REQUEST_INTERVAL_MS,
    },
  );
}

/** Follow nextPagePath until exhausted (dividends, orders, etc.). */
export async function fetchAllT212Paginated<T>(
  environment: Trading212Environment,
  apiKey: string,
  apiSecret: string,
  initialPath: string,
  options?: { maxPages?: number; minRequestIntervalMs?: number },
): Promise<T212PaginatedFetchResult<T>> {
  const maxPages = options?.maxPages ?? 200;
  const minRequestIntervalMs = options?.minRequestIntervalMs ?? T212_MIN_REQUEST_INTERVAL_MS;
  const out: T[] = [];
  let path: string | null = initialPath.includes("?")
    ? initialPath
    : `${initialPath}?limit=50`;
  let pages = 0;
  let lastRequestAt = 0;
  let partial = false;
  let error: string | undefined;

  async function waitForSlot(): Promise<void> {
    const elapsed = Date.now() - lastRequestAt;
    if (lastRequestAt > 0 && elapsed < minRequestIntervalMs) {
      await sleep(minRequestIntervalMs - elapsed);
    }
  }

  while (path && pages < maxPages) {
    const pagePath = path;
    let retries429 = 0;
    for (;;) {
      try {
        await waitForSlot();
        lastRequestAt = Date.now();
        const result = await t212FetchJson<T212Paginated<T>>(environment, apiKey, apiSecret, pagePath);
        const page: T212Paginated<T> = result.data;
        pages += 1;
        if (Array.isArray(page.items)) {
          out.push(...page.items);
        }
        path = page.nextPagePath;
        break;
      } catch (e) {
        const status = (e as T212RequestError).status;
        if (status === 429 && retries429 < T212_MAX_429_RETRIES) {
          retries429 += 1;
          const reset = (e as T212RequestError).rateLimitReset;
          const waitMs =
            reset != null && reset > Date.now()
              ? Math.min(reset - Date.now() + 250, 120_000)
              : T212_429_DEFAULT_BACKOFF_MS * retries429;
          await sleep(waitMs);
          continue;
        }
        partial = true;
        error =
          e instanceof Error ? e.message.slice(0, 500) : "Trading 212 request failed during pagination";
        path = null;
        break;
      }
    }
  }

  if (path && pages >= maxPages) {
    partial = true;
    if (!error) error = "Trading 212 dividend history truncated (page limit reached).";
  }

  return { items: out, partial, error };
}
