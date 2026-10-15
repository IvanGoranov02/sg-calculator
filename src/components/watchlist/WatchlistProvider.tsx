"use client";

import { useSession } from "next-auth/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createWatchlistMutations } from "@/lib/watchlistMutations";
import { getWatchlistSnapshot, normalizeTicker, readWatchlistFromStorage, subscribeWatchlist, WATCHLIST_MAX, writeWatchlistToStorage } from "@/lib/watchlistStorage";

type WatchlistContextValue = {
  symbols: string[];
  add: (raw: string) => Promise<boolean> | boolean;
  remove: (symbol: string) => Promise<void> | void;
  has: (symbol: string) => boolean;
  toggle: (raw: string) => Promise<void> | void;
  cloudReady: boolean;
  error: string | null;
  retry: () => void;
  storageMode: "guest" | "cloud";
};
const WatchlistContext = createContext<WatchlistContextValue | null>(null);
const SERVER_WATCHLIST_EMPTY: string[] = [];
type CloudState = { userId: string; symbols: string[] | null; ready: boolean; error: string | null };

async function patchWatchlist(operation: { action: "add" | "remove"; symbol: string } | { action: "addMany"; symbols: string[] }): Promise<false | { symbols: string[] }> {
  const res = await fetch("/api/watchlist", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(operation) });
  if (!res.ok) return false;
  const data = await res.json() as { symbols?: unknown };
  if (!Array.isArray(data.symbols) || !data.symbols.every((symbol) => typeof symbol === "string")) return false;
  return { symbols: data.symbols };
}

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const userId = status === "authenticated" ? session?.user?.id ?? "" : "";
  const isAuthed = !!userId;
  const guestSymbols = useSyncExternalStore(subscribeWatchlist, getWatchlistSnapshot, () => SERVER_WATCHLIST_EMPTY);
  const [cloud, setCloud] = useState<CloudState>({ userId: "", symbols: null, ready: false, error: null });
  const [retryToken, setRetryToken] = useState(0);
  const mutationsRef = useRef<ReturnType<typeof createWatchlistMutations> | null>(null);

  useEffect(() => {
    mutationsRef.current?.deactivate();
    mutationsRef.current = null;
    let cancelled = false;
    setCloud((prev) => ({ userId, symbols: prev.userId === userId ? prev.symbols : null, ready: false, error: null }));
    if (!userId) return;

    void (async () => {
      try {
        const res = await fetch("/api/watchlist");
        if (!res.ok) throw new Error("watchlist fetch failed");
        const data = (await res.json()) as { symbols?: unknown };
        // An unknown/malformed response is not evidence that the account list is empty.
        if (!Array.isArray(data.symbols) || !data.symbols.every((s) => typeof s === "string")) throw new Error("invalid watchlist");
        if (cancelled) return;
        let symbols: string[] = data.symbols;
        const local = readWatchlistFromStorage();
        if (local.length > 0) {
          const unchanged = local.every((symbol) => symbols.includes(symbol));
          const merged = unchanged ? { symbols } : await patchWatchlist({ action: "addMany", symbols: local });
          if (merged) {
            if (cancelled) return;
            symbols = merged.symbols;
            // Retain guest symbols that did not fit; never silently discard them on login.
            writeWatchlistToStorage(local.filter((symbol) => !symbols.includes(symbol)));
          }
        }
        if (cancelled) return;
        mutationsRef.current = createWatchlistMutations({
          symbols, save: (_next, operation) => patchWatchlist(operation),
          onSaved: (next) => { if (!cancelled) setCloud({ userId, symbols: next, ready: true, error: null }); },
          onError: () => { if (!cancelled) setCloud((prev) => ({ ...prev, error: "save" })); },
        });
        setCloud({ userId, symbols, ready: true, error: null });
      } catch {
        if (!cancelled) setCloud((prev) => ({ ...prev, ready: false, error: "load" }));
      }
    })();
    return () => { cancelled = true; mutationsRef.current?.deactivate(); mutationsRef.current = null; };
  }, [userId, retryToken]);

  const cloudReady = status !== "loading" && (!isAuthed || (cloud.userId === userId && cloud.ready));
  const symbols = isAuthed ? (cloud.userId === userId ? cloud.symbols ?? SERVER_WATCHLIST_EMPTY : SERVER_WATCHLIST_EMPTY) : guestSymbols;
  const mutate = useCallback(async (action: "add" | "remove" | "toggle", raw: string) => {
    if (!cloudReady) return false;
    if (isAuthed) return mutationsRef.current?.mutate(action, raw) ?? false;
    const symbol = normalizeTicker(raw);
    if (!symbol) return false;
    const prev = getWatchlistSnapshot();
    const exists = prev.includes(symbol);
    const removing = action === "remove" || (action === "toggle" && exists);
    if (removing && !exists) return false;
    if (!removing && (exists || prev.length >= WATCHLIST_MAX)) return false;
    writeWatchlistToStorage(removing ? prev.filter((s) => s !== symbol) : [...prev, symbol]);
    return true;
  }, [cloudReady, isAuthed]);
  const add = useCallback((symbol: string) => mutate("add", symbol), [mutate]);
  const remove = useCallback(async (symbol: string) => { await mutate("remove", symbol); }, [mutate]);
  const toggle = useCallback(async (symbol: string) => { await mutate("toggle", symbol); }, [mutate]);
  const has = useCallback((symbol: string) => symbols.includes(normalizeTicker(symbol)), [symbols]);
  const retry = useCallback(() => setRetryToken((n) => n + 1), []);
  const error = isAuthed && cloud.userId === userId ? cloud.error : null;
  const value = useMemo((): WatchlistContextValue => ({ symbols, add, remove, has, toggle, cloudReady, error, retry, storageMode: isAuthed ? "cloud" : "guest" }), [symbols, add, remove, has, toggle, cloudReady, error, retry, isAuthed]);
  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used within WatchlistProvider");
  return ctx;
}
