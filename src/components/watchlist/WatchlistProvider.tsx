"use client";

import { useSession } from "next-auth/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  getWatchlistSnapshot,
  normalizeTicker,
  readWatchlistFromStorage,
  subscribeWatchlist,
  WATCHLIST_MAX,
  writeWatchlistToStorage,
} from "@/lib/watchlistStorage";

type WatchlistContextValue = {
  symbols: string[];
  add: (raw: string) => Promise<boolean> | boolean;
  remove: (symbol: string) => Promise<void> | void;
  has: (symbol: string) => boolean;
  toggle: (raw: string) => Promise<void> | void;
  /** True when logged in and cloud list has finished loading (or failed). */
  cloudReady: boolean;
  /** Saved on server when signed in; otherwise local-only. */
  storageMode: "guest" | "cloud";
};

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

async function putWatchlist(symbols: string[]): Promise<boolean> {
  const res = await fetch("/api/watchlist", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbols }),
  });
  return res.ok;
}

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const isAuthed = status === "authenticated" && !!session?.user?.id;

  const guestSymbols = useSyncExternalStore(subscribeWatchlist, getWatchlistSnapshot, () => []);

  const [serverSymbols, setServerSymbols] = useState<string[] | null>(null);
  const [serverReady, setServerReady] = useState(false);

  useEffect(() => {
    if (!isAuthed) {
      setServerSymbols(null);
      setServerReady(true);
      return;
    }

    setServerReady(false);
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/watchlist");
        if (!res.ok) throw new Error("watchlist fetch failed");
        const data = (await res.json()) as { symbols?: string[] };
        if (cancelled) return;
        let symbols = data.symbols ?? [];

        const local = readWatchlistFromStorage();
        if (local.length > 0) {
          const merged = [...new Set([...symbols, ...local])].slice(0, WATCHLIST_MAX);
          const unchanged =
            merged.length === symbols.length && merged.every((s, i) => s === symbols[i]);
          if (!unchanged) {
            const put = await putWatchlist(merged);
            if (put) {
              symbols = merged;
              writeWatchlistToStorage([]);
            }
          } else {
            writeWatchlistToStorage([]);
          }
        }

        setServerSymbols(symbols);
      } catch {
        if (!cancelled) setServerSymbols([]);
      } finally {
        if (!cancelled) setServerReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthed, session?.user?.id]);

  const symbols = useMemo(() => {
    if (!isAuthed) return guestSymbols;
    if (!serverReady) return guestSymbols;
    return serverSymbols ?? [];
  }, [isAuthed, guestSymbols, serverReady, serverSymbols]);

  const add = useCallback(
    async (raw: string) => {
      const s = normalizeTicker(raw);
      if (!s) return false;

      if (!isAuthed) {
        const prev = getWatchlistSnapshot();
        if (prev.includes(s)) return false;
        if (prev.length >= WATCHLIST_MAX) return false;
        writeWatchlistToStorage([...prev, s]);
        return true;
      }

      if (!serverReady || serverSymbols === null) return false;
      const prev = serverSymbols;
      if (prev.includes(s)) return false;
      if (prev.length >= WATCHLIST_MAX) return false;
      const next = [...prev, s];
      const ok = await putWatchlist(next);
      if (ok) setServerSymbols(next);
      return ok;
    },
    [isAuthed, serverReady, serverSymbols],
  );

  const remove = useCallback(
    async (symbol: string) => {
      const u = normalizeTicker(symbol);

      if (!isAuthed) {
        const prev = getWatchlistSnapshot();
        writeWatchlistToStorage(prev.filter((x) => x !== u));
        return;
      }

      if (!serverReady || serverSymbols === null) return;
      const prev = serverSymbols;
      const next = prev.filter((x) => x !== u);
      const ok = await putWatchlist(next);
      if (ok) setServerSymbols(next);
    },
    [isAuthed, serverReady, serverSymbols],
  );

  const has = useCallback(
    (symbol: string) => symbols.includes(normalizeTicker(symbol)),
    [symbols],
  );

  const toggle = useCallback(
    async (raw: string) => {
      const s = normalizeTicker(raw);
      if (!s) return;

      if (!isAuthed) {
        const prev = getWatchlistSnapshot();
        if (prev.includes(s)) {
          writeWatchlistToStorage(prev.filter((x) => x !== s));
        } else if (prev.length < WATCHLIST_MAX) {
          writeWatchlistToStorage([...prev, s]);
        }
        return;
      }

      if (!serverReady || serverSymbols === null) return;
      const prev = serverSymbols;
      let next: string[];
      if (prev.includes(s)) {
        next = prev.filter((x) => x !== s);
      } else if (prev.length < WATCHLIST_MAX) {
        next = [...prev, s];
      } else {
        return;
      }
      const ok = await putWatchlist(next);
      if (ok) setServerSymbols(next);
    },
    [isAuthed, serverReady, serverSymbols],
  );

  const value = useMemo((): WatchlistContextValue => {
    const storageMode: WatchlistContextValue["storageMode"] = isAuthed ? "cloud" : "guest";
    return {
      symbols,
      add,
      remove,
      has,
      toggle,
      cloudReady: !isAuthed || serverReady,
      storageMode,
    };
  }, [symbols, add, remove, has, toggle, isAuthed, serverReady]);

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext);
  if (!ctx) {
    throw new Error("useWatchlist must be used within WatchlistProvider");
  }
  return ctx;
}
