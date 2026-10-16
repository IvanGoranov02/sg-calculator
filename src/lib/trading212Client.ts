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
  /** Account total. Trading 212 includes cash in this figure. */
  totalValue?: number;
  cash?: {
    availableToTrade?: number;
    inPies?: number;
    reservedForOrders?: number;
  };
  investments?: {
    /** Current market value of open investments. */
    currentValue?: number;
    /** Legacy alias some payloads still send. */
    value?: number;
  };
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
    id?: number | string;
    filledAt?: string;
    quantity?: number;
    type?: string;
  };
  order?: {
    id?: number | string;
    createdAt?: string;
    /** Sort key Trading 212 uses for history cursors. */
    dateModified?: string;
    filledQuantity?: number;
    quantity?: number;
    side?: string;
    status?: string;
    ticker?: string;
    instrument?: { ticker?: string; currency?: string };
  };
};

/** Identity for one fill. Limit=10 restarts overlap limit=50 pages; callers dedupe on this. */
export function t212OrderItemKey(item: T212HistoryOrderItem): string {
  const fillId = item.fill?.id;
  if (fillId != null && String(fillId).trim()) return `fill:${String(fillId).trim()}`;
  const ticker = (item.order?.ticker ?? item.order?.instrument?.ticker ?? "").trim();
  const filledAt = item.fill?.filledAt ?? item.order?.dateModified ?? item.order?.createdAt ?? "";
  const qty = item.fill?.quantity ?? item.order?.filledQuantity ?? item.order?.quantity ?? "";
  const side = (item.order?.side ?? "").trim().toUpperCase();
  return `${ticker}|${filledAt}|${qty}|${side}`;
}

function finiteMoney(n: number | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Cash that must not be counted as portfolio value (free, reserved, and uninvested pie cash). */
export function t212CashBalance(summary: T212AccountSummary): number {
  const cash = summary.cash;
  if (!cash) return 0;
  let sum = 0;
  for (const part of [cash.availableToTrade, cash.inPies, cash.reservedForOrders]) {
    const n = finiteMoney(part);
    if (n != null) sum += n;
  }
  return sum;
}

/**
 * Holdings market value only. `totalValue` is the account total and includes cash.
 * `investments.currentValue` is the open investments. When that field is missing,
 * or it repeats `totalValue`, cash is removed.
 */
export function t212HoldingsMarketValue(summary: T212AccountSummary): number | null {
  const cash = t212CashBalance(summary);
  const total = finiteMoney(summary.totalValue);
  const investments = finiteMoney(summary.investments?.currentValue) ?? finiteMoney(summary.investments?.value);
  if (investments != null && investments >= 0) {
    if (total != null && cash > 0 && Math.abs(investments - total) < 0.01) {
      return Math.max(0, investments - cash);
    }
    return investments;
  }
  if (total != null && total >= 0) return Math.max(0, total - cash);
  return null;
}

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

/** Cursor-less orders walk. A limit=50 cursor that returns an empty page is not resumed. */
export const T212_ORDERS_LIMIT10_RESTART_PATH = "/api/v0/equity/history/orders?limit=10";

/**
 * Prefix for a cursor saved while the cursor-less limit=10 walk is in progress.
 * Stripped before the HTTP call. An empty page on a marked cursor ends that walk.
 * The same cursor without the marker is the poisoned limit=50 cursor.
 */
export const T212_ORDERS_LIMIT10_WALK_PREFIX = "t212-limit10:";

export function stripOrdersLimit10WalkMarker(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.startsWith(T212_ORDERS_LIMIT10_WALK_PREFIX)
    ? trimmed.slice(T212_ORDERS_LIMIT10_WALK_PREFIX.length)
    : trimmed;
}

export function isOrdersLimit10WalkPath(path: string | null | undefined): boolean {
  return Boolean(path?.trim().startsWith(T212_ORDERS_LIMIT10_WALK_PREFIX));
}

/** True for the cursor-less limit=10 orders restart, not a later `cursor=` page. */
export function isOrdersLimit10RestartPath(path: string | null | undefined): boolean {
  const bare = stripOrdersLimit10WalkMarker(path);
  if (!bare?.includes("/equity/history/orders")) return false;
  if (t212PathCursor(bare)) return false;
  return t212HistoryPageLimit(bare) === 10;
}

/** True once orders are being read from the cursor-less limit=10 restart. */
export function ordersResumeInLimit10Walk(path: string | null | undefined): boolean {
  if (!path) return false;
  if (isOrdersLimit10WalkPath(path)) return true;
  return isOrdersLimit10RestartPath(path);
}

/** Keep a limit=10 continuation distinct from the poisoned limit=50 cursor. */
export function tagOrdersLimit10WalkPath(path: string): string {
  if (isOrdersLimit10RestartPath(path) || isOrdersLimit10WalkPath(path)) return path;
  return `${T212_ORDERS_LIMIT10_WALK_PREFIX}${path}`;
}

/**
 * Resume cursor for orders. `"null"` and paths without `cursor=` are not followed,
 * except the cursor-less limit=10 restart after a limit=50 false end.
 * A walk marker is stripped so the HTTP path stays valid.
 */
export function normalizeT212OrdersResumePath(raw: string | null | undefined): string | null {
  const bare = stripOrdersLimit10WalkMarker(raw);
  if (isOrdersLimit10RestartPath(bare)) return T212_ORDERS_LIMIT10_RESTART_PATH;
  return normalizeT212NextPagePath(bare, { requireCursor: true });
}

export function t212PathCursor(path: string | null | undefined): string | null {
  if (!path) return null;
  const qIndex = path.indexOf("?");
  if (qIndex < 0) return null;
  const cursor = new URLSearchParams(path.slice(qIndex + 1)).get("cursor")?.trim();
  return cursor || null;
}

export function t212HistoryPageLimit(path: string): number {
  const qIndex = path.indexOf("?");
  if (qIndex < 0) return 50;
  const limit = Number(new URLSearchParams(path.slice(qIndex + 1)).get("limit") ?? "50");
  return Number.isFinite(limit) && limit > 0 ? limit : 50;
}

function parseTimeMs(raw: string | undefined): number | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Milliseconds cursor for one order. History is ordered by `dateModified`
 * (fill / execution time), then `filledAt`. `createdAt` is when the order was
 * placed and is earlier whenever the fill was not immediate. Using it makes a
 * jumped cursor look healthy and aims the 1ms step at creation time.
 */
export function t212HistoryOrderTimeMs(item: T212HistoryOrderItem): number | null {
  return parseTimeMs(item.order?.dateModified) ?? parseTimeMs(item.fill?.filledAt);
}

export function ordersHistoryPathBase(path: string): string {
  const q = path.indexOf("?");
  const base = (q >= 0 ? path.slice(0, q) : path).trim();
  return base || "/api/v0/equity/history/orders";
}

/** Orders page that continues strictly before `cursorMs`, keeping the page limit. */
export function ordersPathWithCursor(path: string, cursorMs: number): string {
  const limit = t212HistoryPageLimit(path);
  return `${ordersHistoryPathBase(path)}?cursor=${cursorMs}&limit=${limit}`;
}

/**
 * Trading 212 builds `nextPagePath` from filled orders only, then returns cancelled
 * rows on the same page. The cursor jumps older than every item just received and
 * drops the block in between (smaller than `limit`). Accounts with cancelled orders
 * lose fills; accounts without them paginate normally.
 * When the cursor is older than the oldest item on the page, continue from that item.
 * A cursor at or after the oldest item is left alone so a healthy walk is unchanged.
 * A missing next path is not rewritten here — the false-end fallback handles it.
 */
export function ordersNextPathAvoidingSkip(input: {
  requestedPath: string;
  pageItems: T212HistoryOrderItem[];
  nextPagePath: string | null;
}): string | null {
  if (!input.nextPagePath) return null;
  const oldest = oldestT212HistoryCursorMs(input.pageItems);
  if (oldest == null) return input.nextPagePath;
  const apiCursor = t212PathCursor(input.nextPagePath);
  const apiMs = apiCursor != null ? Number(apiCursor) : NaN;
  if (!Number.isFinite(apiMs) || apiMs >= oldest) return input.nextPagePath;

  const requested = t212PathCursor(input.requestedPath);
  const requestedMs = requested != null ? Number(requested) : NaN;
  let nextMs = oldest;
  if (Number.isFinite(requestedMs) && nextMs >= requestedMs) nextMs = requestedMs - 1;
  return ordersPathWithCursor(input.requestedPath, nextMs);
}

export function oldestT212HistoryCursorMs(items: T212HistoryOrderItem[]): number | null {
  let oldest: number | null = null;
  for (const item of items) {
    const ms = t212HistoryOrderTimeMs(item);
    if (ms == null) continue;
    if (oldest == null || ms < oldest) oldest = ms;
  }
  return oldest;
}

/**
 * A limit=50 cursor is the oldest fill's epoch millis. An empty page on that cursor
 * (including the limit=10 retry of the same cursor) is not the end of history.
 * Restart at limit=10 with no cursor and follow that walk until a short page.
 * The restart path is not issued twice in one fetch.
 */
export function nextOrdersPathAfterFalseEnd(input: {
  requestedPath: string;
  pageItemCount: number;
  collected: T212HistoryOrderItem[];
  triedFallbackPaths: ReadonlySet<string>;
  /** Already inside the cursor-less limit=10 walk. Empty and short pages end it. */
  limit10Walk?: boolean;
}): string | null {
  if (input.limit10Walk) return null;
  if (input.triedFallbackPaths.has(T212_ORDERS_LIMIT10_RESTART_PATH)) return null;
  if (isOrdersLimit10RestartPath(input.requestedPath)) return null;

  const limit = t212HistoryPageLimit(input.requestedPath);
  const shortPage = input.pageItemCount > 0 && input.pageItemCount < limit;
  if (shortPage) return null;

  if (limit > 10) return T212_ORDERS_LIMIT10_RESTART_PATH;

  const cursor = t212PathCursor(input.requestedPath);
  const oldest = oldestT212HistoryCursorMs(input.collected);
  if (
    input.pageItemCount === 0 &&
    cursor &&
    oldest != null &&
    cursor === String(oldest)
  ) {
    return T212_ORDERS_LIMIT10_RESTART_PATH;
  }
  return null;
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
  options?: {
    maxPages?: number;
    minRequestIntervalMs?: number;
    startPath?: string | null;
    /** Resume path was saved during the cursor-less limit=10 walk. */
    limit10Walk?: boolean;
  },
): Promise<T212PaginatedFetchResult<T212HistoryOrderItem>> {
  const limit10Walk =
    Boolean(options?.limit10Walk) || ordersResumeInLimit10Walk(options?.startPath);
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
      ordersLimit10Walk: limit10Walk,
      falseEndFallbackPath: (input) => nextOrdersPathAfterFalseEnd(input),
      itemKey: t212OrderItemKey,
      avoidSkippedOrdersCursor: (input) =>
        ordersNextPathAvoidingSkip({
          requestedPath: input.requestedPath,
          pageItems: input.pageItems,
          nextPagePath: input.nextPagePath,
        }),
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
    /** Orders only. Drop duplicate fills when a limit=10 restart overlaps limit=50 pages. */
    itemKey?: (item: T) => string;
    /**
     * Orders only. When a limit=50 cursor falsely ends, return the cursor-less limit=10 path.
     */
    falseEndFallbackPath?: (input: {
      requestedPath: string;
      pageItemCount: number;
      collected: T[];
      triedFallbackPaths: ReadonlySet<string>;
      limit10Walk: boolean;
    }) => string | null;
    /** Orders only. Resume is already the cursor-less limit=10 walk. */
    ordersLimit10Walk?: boolean;
    /**
     * Orders only. Replace a next cursor that is older than every item on the page.
     * Dividends and positions must not use this.
     */
    avoidSkippedOrdersCursor?: (input: {
      requestedPath: string;
      pageItems: T[];
      nextPagePath: string | null;
    }) => string | null;
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
  const triedFallbackPaths = new Set<string>();
  const seenItemKeys = new Set<string>();
  const seenOrderCursors = new Set<string>();
  let limit10Walk = Boolean(options?.ordersLimit10Walk);

  function pathForNextPoll(candidate: string | null): string | null {
    if (!candidate || !limit10Walk) return candidate;
    return tagOrdersLimit10WalkPath(candidate);
  }

  /** A repeated cursor is not the end of history. Resume 1ms behind the oldest fill. */
  function resumePathBehindOldestFill(items: T[], fromPath: string): string | null {
    const oldest = oldestT212HistoryCursorMs(items as T212HistoryOrderItem[]);
    if (oldest == null) return pathForNextPoll(fromPath);
    return pathForNextPoll(ordersPathWithCursor(fromPath, oldest - 1));
  }

  async function waitForSlot(): Promise<void> {
    const elapsed = Date.now() - lastRequestAt;
    if (lastRequestAt > 0 && elapsed < minRequestIntervalMs) {
      await sleep(minRequestIntervalMs - elapsed);
    }
  }

  while (path && pages < maxPages) {
    const pagePath: string = path;
    if (options?.avoidSkippedOrdersCursor) {
      const requestedCursor = t212PathCursor(pagePath);
      if (requestedCursor) {
        if (seenOrderCursors.has(requestedCursor)) {
          // The previous page handed back a cursor we already requested. That is
          // a stall, not a finished walk — keep paging from the oldest fill.
          partial = true;
          nextPagePath = resumePathBehindOldestFill(out, pagePath);
          path = null;
          break;
        }
        seenOrderCursors.add(requestedCursor);
      }
    }
    let retries429 = 0;
    for (;;) {
      try {
        await waitForSlot();
        lastRequestAt = Date.now();
        const result = await t212FetchJson<T212Paginated<T>>(environment, apiKey, apiSecret, pagePath);
        const page: T212Paginated<T> = result.data;
        pages += 1;
        const pageItems = Array.isArray(page.items) ? page.items : [];
        const sizeBefore = out.length;
        if (options?.itemKey) {
          for (const item of pageItems) {
            const key = options.itemKey(item);
            if (seenItemKeys.has(key)) continue;
            seenItemKeys.add(key);
            out.push(item);
          }
        } else if (pageItems.length > 0) {
          out.push(...pageItems);
        }
        const added = out.length - sizeBefore;
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
        let normalizedNext: string | null = resolution.action === "follow" ? resolution.path : null;
        if (options?.avoidSkippedOrdersCursor) {
          normalizedNext = options.avoidSkippedOrdersCursor({
            requestedPath: pagePath,
            pageItems,
            nextPagePath: normalizedNext,
          });
        }
        // Overlap with fills already collected (a limit=10 restart, or a rewound cursor).
        // Follow a next cursor we have not requested. If this page did not move,
        // step 1ms once inside this fetch. A second stall stays partial: storing
        // it as finished would keep a gapped cache on Refresh.
        if (options?.avoidSkippedOrdersCursor && added === 0 && pageItems.length > 0) {
          const nextCursor = normalizedNext ? t212PathCursor(normalizedNext) : null;
          if (normalizedNext && nextCursor && !seenOrderCursors.has(nextCursor)) {
            path = normalizedNext;
            break;
          }
          const requestedMs = Number(t212PathCursor(pagePath));
          if (Number.isFinite(requestedMs)) {
            const steppedCursor = String(requestedMs - 1);
            if (!seenOrderCursors.has(steppedCursor)) {
              path = ordersPathWithCursor(pagePath, requestedMs - 1);
              break;
            }
          }
          partial = true;
          nextPagePath = resumePathBehindOldestFill(out.length > 0 ? out : pageItems, pagePath);
          path = null;
          break;
        }
        if (options?.avoidSkippedOrdersCursor && normalizedNext) {
          const nextCursor = t212PathCursor(normalizedNext);
          if (nextCursor && seenOrderCursors.has(nextCursor)) {
            partial = true;
            nextPagePath = resumePathBehindOldestFill(out.length > 0 ? out : pageItems, pagePath);
            path = null;
            break;
          }
        }
        const retryPath: string | null = options?.retryEmptyPages
          ? retryPathForEmptyHistoryPage({
              requestedPath: pagePath,
              itemCount: pageItems.length,
              nextPagePath: normalizedNext,
              retriedCursors,
            })
          : null;
        if (normalizedNext) {
          path = normalizedNext;
        } else {
          const fallback = options?.falseEndFallbackPath?.({
            requestedPath: pagePath,
            pageItemCount: pageItems.length,
            collected: out,
            triedFallbackPaths,
            limit10Walk,
          });
          if (fallback && !triedFallbackPaths.has(fallback)) {
            triedFallbackPaths.add(fallback);
            if (isOrdersLimit10RestartPath(fallback)) limit10Walk = true;
            path = fallback;
          } else if (retryPath) {
            const cursor = t212PathCursor(pagePath);
            if (cursor) retriedCursors.add(cursor);
            path = retryPath;
          } else {
            path = null;
          }
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
        nextPagePath = pathForNextPoll(pagePath);
        path = null;
        break;
      }
    }
  }

  if (path && pages >= maxPages) {
    partial = true;
    nextPagePath = pathForNextPoll(path);
    if (!error) error = "Trading 212 history truncated (page limit reached).";
  }

  return { items: out, partial, error, nextPagePath, status };
}
