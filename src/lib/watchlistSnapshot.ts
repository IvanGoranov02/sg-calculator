/**
 * Last watchlist quotes seen in this browser. Lets the watchlist paint at once on the next
 * visit (with an "updated … ago" note) while fresh quotes are fetched.
 */

export const WATCHLIST_SNAPSHOT_KEY = "sg-watchlist-snapshot-v1";
/** Older than this is not worth showing. */
export const WATCHLIST_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type WatchlistSnapshot<Q, H> = {
  fetchedAt: number;
  quotes: Q[];
  history: Record<string, H[]>;
};

type Store = Pick<Storage, "getItem" | "setItem">;

export function readWatchlistSnapshot<Q extends { symbol: string }, H>(
  storage: Store | null,
  symbols: string[],
  nowMs = Date.now(),
): WatchlistSnapshot<Q, H> | null {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(WATCHLIST_SNAPSHOT_KEY) ?? "null") as WatchlistSnapshot<Q, H> | null;
    if (!parsed || !Number.isFinite(parsed.fetchedAt) || !Array.isArray(parsed.quotes)) return null;
    if (nowMs - parsed.fetchedAt > WATCHLIST_SNAPSHOT_MAX_AGE_MS) return null;
    const wanted = new Set(symbols.map((s) => s.toUpperCase()));
    const bySymbol = new Map(parsed.quotes.filter((q) => q && typeof q.symbol === "string").map((q) => [q.symbol.toUpperCase(), q]));
    // Same order as the list, and only symbols still on it.
    const quotes = symbols.map((s) => bySymbol.get(s.toUpperCase())).filter((q): q is Q => q != null);
    if (quotes.length === 0) return null;
    const history: Record<string, H[]> = {};
    for (const [sym, bars] of Object.entries(parsed.history ?? {})) {
      if (wanted.has(sym.toUpperCase()) && Array.isArray(bars)) history[sym] = bars;
    }
    return { fetchedAt: parsed.fetchedAt, quotes, history };
  } catch {
    return null;
  }
}

export function writeWatchlistSnapshot<Q, H>(storage: Store | null, snapshot: WatchlistSnapshot<Q, H>): void {
  if (!storage) return;
  try {
    storage.setItem(WATCHLIST_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage full or blocked (private mode): the page simply loads without a snapshot next time.
  }
}

export function browserStorage(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
