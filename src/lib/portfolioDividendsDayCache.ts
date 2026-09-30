/**
 * Portfolio Dividends tab cache.
 *
 * A successful payload is reused for the rest of the user-local calendar day
 * (browser timezone, YYYY-MM-DD — not UTC). Opening Dividends again that day
 * does not refetch. The next local calendar day may fetch. Explicit refresh
 * and holdings/sync invalidation still refetch immediately.
 */

export const PORTFOLIO_DIVIDENDS_DAY_CACHE_KEY = "sg-portfolio-dividends-day-v1";

export type PortfolioDividendsDayCacheRecord<T> = {
  userId: string;
  /** User-local calendar day, YYYY-MM-DD. */
  localDate: string;
  payload: T;
};

export type PortfolioDividendsDayMemory<T> = PortfolioDividendsDayCacheRecord<T> & {
  reloadToken: number;
  liveRefreshToken: number;
};

export type DividendsLoadAction = "reuse" | "fetch" | "force";

export type DividendsLoadDecision<T> = {
  action: DividendsLoadAction;
  payload: T | null;
  /** Set when a same-day stored record should become this tab's session memory. */
  adoptMemory: PortfolioDividendsDayMemory<T> | null;
};

type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

/** User-local calendar day. Expiry is local midnight, not a rolling 24h or UTC day. */
export function userLocalCalendarDay(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isLocalDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parsePortfolioDividendsDayCache<T>(raw: string | null): PortfolioDividendsDayCacheRecord<T> | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;
    const o = data as Record<string, unknown>;
    if (typeof o.userId !== "string" || !o.userId) return null;
    if (!isLocalDate(o.localDate)) return null;
    if (!o.payload || typeof o.payload !== "object") return null;
    return {
      userId: o.userId,
      localDate: o.localDate,
      payload: o.payload as T,
    };
  } catch {
    return null;
  }
}

function freshRecord<T>(
  record: PortfolioDividendsDayCacheRecord<T> | null,
  userId: string,
  today: string,
): PortfolioDividendsDayCacheRecord<T> | null {
  if (!record || record.userId !== userId || record.localDate !== today) return null;
  return record;
}

/**
 * Same-day tab opens reuse the cache. A higher live-refresh token forces
 * `?refresh=1`. A higher reload token (sync, disconnect, holding edits)
 * refetches without forcing the broker dividend pull.
 */
export function decidePortfolioDividendsLoad<T>(input: {
  userId: string;
  reloadToken: number;
  liveRefreshToken: number;
  now?: Date;
  memory: PortfolioDividendsDayMemory<T> | null;
  stored: PortfolioDividendsDayCacheRecord<T> | null;
}): DividendsLoadDecision<T> {
  const today = userLocalCalendarDay(input.now ?? new Date());
  const memory = freshRecord(input.memory, input.userId, today);
  const stored = freshRecord(input.stored, input.userId, today);
  const payload = memory?.payload ?? stored?.payload ?? null;

  if (memory && input.liveRefreshToken > memory.liveRefreshToken) {
    return { action: "force", payload, adoptMemory: null };
  }
  if (memory && input.reloadToken > memory.reloadToken) {
    return { action: "fetch", payload, adoptMemory: null };
  }
  if (memory) {
    return { action: "reuse", payload: memory.payload, adoptMemory: null };
  }

  if (stored) {
    if (input.liveRefreshToken > 0) {
      return { action: "force", payload: stored.payload, adoptMemory: null };
    }
    if (input.reloadToken > 0) {
      return { action: "fetch", payload: stored.payload, adoptMemory: null };
    }
    return {
      action: "reuse",
      payload: stored.payload,
      adoptMemory: {
        ...stored,
        reloadToken: input.reloadToken,
        liveRefreshToken: input.liveRefreshToken,
      },
    };
  }

  return {
    action: input.liveRefreshToken > 0 ? "force" : "fetch",
    payload: null,
    adoptMemory: null,
  };
}

/** Last successful load in this browser tab. Ignored during SSR. */
let sessionMemory: PortfolioDividendsDayMemory<unknown> | null = null;

export function readPortfolioDividendsSessionMemory<T>(): PortfolioDividendsDayMemory<T> | null {
  if (typeof window === "undefined") return null;
  return sessionMemory as PortfolioDividendsDayMemory<T> | null;
}

export function writePortfolioDividendsSessionMemory<T>(memory: PortfolioDividendsDayMemory<T> | null): void {
  if (typeof window === "undefined") return;
  sessionMemory = memory;
}

export function readStoredPortfolioDividendsDayCache<T>(
  storage: KeyValueStorage | null,
  userId: string,
): PortfolioDividendsDayCacheRecord<T> | null {
  if (!storage || !userId) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(PORTFOLIO_DIVIDENDS_DAY_CACHE_KEY);
  } catch {
    return null;
  }
  const parsed = parsePortfolioDividendsDayCache<T>(raw);
  if (!parsed) return null;
  if (parsed.userId !== userId) {
    try {
      storage.removeItem?.(PORTFOLIO_DIVIDENDS_DAY_CACHE_KEY);
    } catch {
      // Ignore private-mode storage failures.
    }
    return null;
  }
  return parsed;
}

export function writeStoredPortfolioDividendsDayCache<T>(
  storage: KeyValueStorage | null,
  record: PortfolioDividendsDayCacheRecord<T>,
): void {
  if (!storage) return;
  try {
    storage.setItem(PORTFOLIO_DIVIDENDS_DAY_CACHE_KEY, JSON.stringify(record));
  } catch {
    // Quota or private mode — session memory still covers this tab.
  }
}

export function commitPortfolioDividendsDayCache<T>(input: {
  storage: KeyValueStorage | null;
  userId: string;
  payload: T;
  reloadToken: number;
  liveRefreshToken: number;
  now?: Date;
}): void {
  if (!input.userId) return;
  const record: PortfolioDividendsDayCacheRecord<T> = {
    userId: input.userId,
    localDate: userLocalCalendarDay(input.now ?? new Date()),
    payload: input.payload,
  };
  writePortfolioDividendsSessionMemory({
    ...record,
    reloadToken: input.reloadToken,
    liveRefreshToken: input.liveRefreshToken,
  });
  writeStoredPortfolioDividendsDayCache(input.storage, record);
}
