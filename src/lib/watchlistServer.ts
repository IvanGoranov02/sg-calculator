import { parseWatchlistInput } from "@/lib/watchlistInput";
import { normalizeTicker, WATCHLIST_MAX } from "@/lib/watchlistStorage";

export type WatchlistMutation =
  | { action: "add" | "remove" | "toggle"; symbol: string }
  | { action: "addMany"; symbols: string[] };

export function parseWatchlistMutation(raw: unknown): WatchlistMutation | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as { action?: unknown; symbol?: unknown; symbols?: unknown };
  if (input.action === "addMany") {
    const symbols = parseWatchlistInput({ symbols: input.symbols });
    return symbols === null ? null : { action: "addMany", symbols };
  }
  if (input.action !== "add" && input.action !== "remove" && input.action !== "toggle") return null;
  if (typeof input.symbol !== "string") return null;
  const symbol = normalizeTicker(input.symbol);
  return symbol ? { action: input.action, symbol } : null;
}

export type WatchlistTransaction = {
  lockUser: (userId: string) => Promise<boolean>;
  readSymbols: (userId: string) => Promise<string[]>;
  replaceSymbols: (userId: string, symbols: string[]) => Promise<void>;
};

/** The adapter holds a database transaction and the user lock until the callback finishes. */
export type WatchlistStore = {
  transaction: <T>(work: (tx: WatchlistTransaction) => Promise<T>) => Promise<T>;
};

export type WatchlistWriteResult = {
  status: 200 | 400 | 404 | 409;
  body: { symbols?: string[]; error?: string };
};

function applyMutation(current: string[], mutation: WatchlistMutation): string[] {
  if (mutation.action === "addMany") return [...new Set([...current, ...mutation.symbols])];
  const contains = current.includes(mutation.symbol);
  if (mutation.action === "remove" || (mutation.action === "toggle" && contains)) {
    return current.filter((symbol) => symbol !== mutation.symbol);
  }
  return contains ? current : [...current, mutation.symbol];
}

export async function mutateSavedWatchlist(
  store: WatchlistStore,
  userId: string,
  raw: unknown,
): Promise<WatchlistWriteResult> {
  const mutation = parseWatchlistMutation(raw);
  if (!mutation) return { status: 400, body: { error: "Invalid watchlist action or symbols" } };

  return store.transaction(async (tx) => {
    if (!await tx.lockUser(userId)) return { status: 404, body: { error: "User not found" } };
    // Read after acquiring the lock: another tab's committed action is part of
    // the current list, even when this request began before that action finished.
    const current = await tx.readSymbols(userId);
    const next = applyMutation(current, mutation);
    if (next.length > WATCHLIST_MAX) {
      return { status: 409, body: { error: `Watchlist can contain at most ${WATCHLIST_MAX} symbols`, symbols: current } };
    }
    if (next.length !== current.length || next.some((symbol, i) => symbol !== current[i])) {
      await tx.replaceSymbols(userId, next);
    }
    return { status: 200, body: { symbols: next } };
  });
}

/** Keep the legacy replacement endpoint's validation, with the same writer lock as PATCH. */
export async function replaceSavedWatchlist(
  store: WatchlistStore,
  userId: string,
  raw: unknown,
): Promise<WatchlistWriteResult> {
  const symbols = parseWatchlistInput(raw);
  if (symbols === null) {
    return { status: 400, body: { error: "Expected an array of up to 50 non-empty symbols" } };
  }
  return store.transaction(async (tx) => {
    if (!await tx.lockUser(userId)) return { status: 404, body: { error: "User not found" } };
    await tx.replaceSymbols(userId, symbols);
    return { status: 200, body: { symbols } };
  });
}
