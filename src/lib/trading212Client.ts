/**
 * Server-only Trading 212 Public API client (Basic auth).
 * @see https://docs.trading212.com/api
 */

import type { Trading212Environment } from "@prisma/client";

import { trading212UserErrorMessage } from "@/lib/trading212Errors";

const BASE: Record<Trading212Environment, string> = {
  demo: "https://demo.trading212.com",
  live: "https://live.trading212.com",
};

export type T212Position = {
  averagePricePaid?: number;
  /** Legacy /equity/portfolio field. */
  averagePrice?: number;
  createdAt?: string;
  currentPrice?: number;
  /** Some payloads put the unique ticker on the position instead of `instrument`. */
  ticker?: string;
  instrumentCode?: string;
  instrument?: { currency?: string; isin?: string; name?: string; ticker?: string };
  quantity?: number;
  quantityAvailableForTrading?: number;
  quantityInPies?: number;
  /** Legacy pie quantity field. */
  pieQuantity?: number;
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

export type T212HistoryOrderItem = {
  fill?: {
    filledAt?: string;
    quantity?: number;
    type?: string;
  };
  order?: {
    createdAt?: string;
    filledQuantity?: number;
    quantity?: number;
    side?: string;
    status?: string;
    ticker?: string;
    instrument?: { ticker?: string; currency?: string };
  };
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
  /** Cursor to resume older pages when `partial` is true. */
  nextPagePath?: string | null;
  /** HTTP status of the error that stopped pagination, when the broker returned one. */
  status?: number;
};

export type T212NextPageResolution =
  | { action: "end" }
  | { action: "follow"; path: string }
  | { action: "reject" };

/**
 * Clean a Trading 212 `nextPagePath`.
 * `"null"` is a real end. A path we refuse (orders require `cursor=`) is `reject`,
 * which callers must persist as partial — not as a finished series.
 * Dividends and positions do not require `cursor=`, so a usable path is followed.
 */
export function resolveT212NextPagePath(
  raw: unknown,
  opts?: { requireCursor?: boolean },
): T212NextPageResolution {
  if (raw == null) return { action: "end" };
  if (typeof raw !== "string") return { action: "reject" };
  let path = raw.trim();
  if (!path || path === "null" || /^null([?&]|$)/.test(path)) return { action: "end" };
  path = path
    .replace(/([?&])instrumentCode(?=&|$)/g, "$1")
    .replace(/\?&/g, "?")
    .replace(/&&+/g, "&")
    .replace(/[?&]$/g, "");
  if (!path) return { action: "end" };
  if (opts?.requireCursor && !path.includes("cursor=")) return { action: "reject" };
  return { action: "follow", path };
}

/** Follow-path only. `end` and `reject` are both null — use {@link resolveT212NextPagePath} to tell them apart. */
export function normalizeT212NextPagePath(
  raw: unknown,
  opts?: { requireCursor?: boolean },
): string | null {
  const resolved = resolveT212NextPagePath(raw, opts);
  return resolved.action === "follow" ? resolved.path : null;
}

/** Resume cursor for orders. `"null"` and paths without `cursor=` are not followed. */
export function normalizeT212OrdersResumePath(raw: string | null | undefined): string | null {
  return normalizeT212NextPagePath(raw, { requireCursor: true });
}

/**
 * A full page followed by an empty terminal page drops older fills at limit=50.
 * Retry that cursor once at limit=10 before accepting the end of history.
 */
export function retryPathForEmptyHistoryPage(input: {
  requestedPath: string;
  itemCount: number;
  nextPagePath: string | null;
  retriedCursors: ReadonlySet<string>;
}): string | null {
  if (input.itemCount !== 0 || input.nextPagePath) return null;
  const qIndex = input.requestedPath.indexOf("?");
  if (qIndex < 0) return null;
  const params = new URLSearchParams(input.requestedPath.slice(qIndex + 1));
  const cursor = params.get("cursor")?.trim();
  if (!cursor || input.retriedCursors.has(cursor)) return null;
  const limit = Number(params.get("limit") ?? "20");
  if (!Number.isFinite(limit) || limit <= 10) return null;
  const base = input.requestedPath.slice(0, qIndex) || "/api/v0/equity/history/orders";
  params.set("limit", "10");
  params.delete("instrumentCode");
  return `${base}?${params.toString()}`;
}

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
      cache: "no-store",
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
      const err: T212RequestError = Object.assign(
        new Error(trading212UserErrorMessage(res.status, detail)),
        {
          status: res.status,
          rateLimitReset,
        },
      );
      throw err;
    }

    const data = (await res.json()) as T;
    return { data, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

function asPositionArray(value: unknown): T212Position[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((x) => x && typeof x === "object") as T212Position[];
}

/** Normalize a legacy /equity/portfolio row onto the current Position shape. */
export function normalizeT212Position(raw: T212Position): T212Position {
  const ticker =
    (typeof raw.instrument?.ticker === "string" && raw.instrument.ticker.trim()) ||
    (typeof raw.ticker === "string" && raw.ticker.trim()) ||
    (typeof raw.instrumentCode === "string" && raw.instrumentCode.trim()) ||
    undefined;
  const instrument = raw.instrument ? { ...raw.instrument } : {};
  if (ticker && !instrument.ticker) instrument.ticker = ticker;
  return {
    ...raw,
    ticker,
    instrument: Object.keys(instrument).length > 0 ? instrument : raw.instrument,
    averagePricePaid: raw.averagePricePaid ?? raw.averagePrice,
    quantityInPies: raw.quantityInPies ?? raw.pieQuantity,
  };
}

export type T212PositionsPage = {
  positions: T212Position[];
  nextPagePath: string | null;
};

/** Parse array, `{ items }`, `{ positions }`, or a single position object. */
export function normalizePositionsPayload(data: unknown): T212PositionsPage {
  if (Array.isArray(data)) {
    return { positions: data.map(normalizeT212Position), nextPagePath: null };
  }
  if (!data || typeof data !== "object") {
    return { positions: [], nextPagePath: null };
  }
  const o = data as Record<string, unknown>;
  const next =
    typeof o.nextPagePath === "string" && o.nextPagePath.trim() && o.nextPagePath !== "null"
      ? o.nextPagePath
      : null;
  for (const key of ["items", "positions", "data"] as const) {
    const arr = asPositionArray(o[key]);
    if (arr) return { positions: arr.map(normalizeT212Position), nextPagePath: next };
  }
  if (o.instrument || o.ticker || o.instrumentCode || o.quantity != null) {
    return { positions: [normalizeT212Position(o as T212Position)], nextPagePath: next };
  }
  return { positions: [], nextPagePath: next };
}

const T212_POSITIONS_MIN_INTERVAL_MS = 1_100;

export async function fetchT212Positions(
  environment: Trading212Environment,
  apiKey: string,
  apiSecret: string,
): Promise<T212Position[]> {
  const first = await t212FetchJson<unknown>(
    environment,
    apiKey,
    apiSecret,
    "/api/v0/equity/positions",
  );
  const page = normalizePositionsPayload(first.data);
  const out: T212Position[] = [...page.positions];

  if (page.nextPagePath) {
    const rest = await fetchAllT212Paginated<T212Position>(environment, apiKey, apiSecret, page.nextPagePath, {
      maxPages: 40,
      minRequestIntervalMs: T212_POSITIONS_MIN_INTERVAL_MS,
    });
    out.push(...rest.items.map(normalizeT212Position));
  }

  if (out.length > 0) return out;

  // Legacy open-positions endpoint used by older API keys / docs.
  try {
    await sleep(T212_POSITIONS_MIN_INTERVAL_MS);
    const legacy = await t212FetchJson<unknown>(
      environment,
      apiKey,
      apiSecret,
      "/api/v0/equity/portfolio",
    );
    return normalizePositionsPayload(legacy.data).positions;
  } catch {
    return out;
  }
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

/** Historical orders/fills. Rate limit is 6/min — keep maxPages small. */
export async function fetchT212HistoryOrders(
  environment: Trading212Environment,
  apiKey: string,
  apiSecret: string,
  options?: { maxPages?: number; minRequestIntervalMs?: number; startPath?: string | null },
): Promise<T212PaginatedFetchResult<T212HistoryOrderItem>> {
  const resumed = normalizeT212OrdersResumePath(options?.startPath);
  const initialPath = resumed || "/api/v0/equity/history/orders";
  return fetchAllT212Paginated<T212HistoryOrderItem>(
    environment,
    apiKey,
    apiSecret,
    initialPath,
    {
      maxPages: options?.maxPages ?? 6,
      minRequestIntervalMs: options?.minRequestIntervalMs ?? T212_MIN_REQUEST_INTERVAL_MS,
      requireCursor: true,
      retryEmptyPages: true,
    },
  );
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
  options?: {
    maxPages?: number;
    minRequestIntervalMs?: number;
    /** Orders only. A next path without `cursor=` is an incomplete walk, not the end. */
    requireCursor?: boolean;
    /** Orders only. Dividends and positions must not retry an empty page at a smaller limit. */
    retryEmptyPages?: boolean;
  },
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
  let status: number | undefined;
  let nextPagePath: string | null = null;
  const retriedCursors = new Set<string>();

  async function waitForSlot(): Promise<void> {
    const elapsed = Date.now() - lastRequestAt;
    if (lastRequestAt > 0 && elapsed < minRequestIntervalMs) {
      await sleep(minRequestIntervalMs - elapsed);
    }
  }

  while (path && pages < maxPages) {
    const pagePath: string = path;
    let retries429 = 0;
    for (;;) {
      try {
        await waitForSlot();
        lastRequestAt = Date.now();
        const result = await t212FetchJson<T212Paginated<T>>(environment, apiKey, apiSecret, pagePath);
        const page: T212Paginated<T> = result.data;
        pages += 1;
        const pageItems = Array.isArray(page.items) ? page.items : [];
        if (pageItems.length > 0) out.push(...pageItems);
        const resolution = resolveT212NextPagePath(page.nextPagePath, {
          requireCursor: options?.requireCursor,
        });
        if (resolution.action === "reject") {
          partial = true;
          if (!error) error = "Trading 212 next page path was not usable.";
          nextPagePath = null;
          path = null;
          break;
        }
        const normalizedNext: string | null = resolution.action === "follow" ? resolution.path : null;
        const retryPath: string | null = options?.retryEmptyPages
          ? retryPathForEmptyHistoryPage({
              requestedPath: pagePath,
              itemCount: pageItems.length,
              nextPagePath: normalizedNext,
              retriedCursors,
            })
          : null;
        if (retryPath) {
          const cursor = new URLSearchParams(pagePath.slice(pagePath.indexOf("?") + 1)).get("cursor");
          if (cursor) retriedCursors.add(cursor);
          path = retryPath;
        } else {
          path = normalizedNext;
        }
        break;
      } catch (e) {
        const httpStatus = (e as T212RequestError).status;
        if (httpStatus === 429 && retries429 < T212_MAX_429_RETRIES) {
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
        status = httpStatus;
        error =
          e instanceof Error ? e.message.slice(0, 500) : "Trading 212 request failed during pagination";
        nextPagePath = pagePath;
        path = null;
        break;
      }
    }
  }

  if (path && pages >= maxPages) {
    partial = true;
    nextPagePath = path;
    if (!error) error = "Trading 212 history truncated (page limit reached).";
  }

  return { items: out, partial, error, nextPagePath, status };
}
