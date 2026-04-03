"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  getWatchlistSnapshot,
  normalizeTicker,
  subscribeWatchlist,
  WATCHLIST_MAX,
  writeWatchlistToStorage,
} from "@/lib/watchlistStorage";

type WatchlistContextValue = {
  symbols: string[];
  add: (raw: string) => boolean;
  remove: (symbol: string) => void;
  has: (symbol: string) => boolean;
  toggle: (raw: string) => void;
};

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const symbols = useSyncExternalStore(subscribeWatchlist, getWatchlistSnapshot, () => []);

  const add = useCallback((raw: string) => {
    const s = normalizeTicker(raw);
    if (!s) return false;
    const prev = getWatchlistSnapshot();
    if (prev.includes(s)) return false;
    if (prev.length >= WATCHLIST_MAX) return false;
    writeWatchlistToStorage([...prev, s]);
    return true;
  }, []);

  const remove = useCallback((symbol: string) => {
    const u = normalizeTicker(symbol);
    const prev = getWatchlistSnapshot();
    writeWatchlistToStorage(prev.filter((x) => x !== u));
  }, []);

  const has = useCallback(
    (symbol: string) => symbols.includes(normalizeTicker(symbol)),
    [symbols],
  );

  const toggle = useCallback((raw: string) => {
    const s = normalizeTicker(raw);
    if (!s) return;
    const prev = getWatchlistSnapshot();
    if (prev.includes(s)) {
      writeWatchlistToStorage(prev.filter((x) => x !== s));
    } else if (prev.length < WATCHLIST_MAX) {
      writeWatchlistToStorage([...prev, s]);
    }
  }, []);

  const value = useMemo(
    () => ({ symbols, add, remove, has, toggle }),
    [symbols, add, remove, has, toggle],
  );

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext);
  if (!ctx) {
    throw new Error("useWatchlist must be used within WatchlistProvider");
  }
  return ctx;
}
