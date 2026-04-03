const STORAGE_KEY = "sg-watchlist-v1";
export const WATCHLIST_MAX = 50;

/** Same-tab updates (storage event only fires for other tabs). */
export const WATCHLIST_CHANGED_EVENT = "sg-watchlist-changed";

let snapshotKey: string | null = null;
let snapshotVal: string[] = [];

export function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase();
}

export function parseWatchlistJson(json: string | null): string[] {
  if (!json) return [];
  try {
    const data = JSON.parse(json) as unknown;
    if (!Array.isArray(data)) return [];
    const out: string[] = [];
    for (const item of data) {
      if (typeof item !== "string") continue;
      const s = normalizeTicker(item);
      if (s && !out.includes(s)) out.push(s);
      if (out.length >= WATCHLIST_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function readWatchlistFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  return parseWatchlistJson(window.localStorage.getItem(STORAGE_KEY));
}

/** Stable snapshot for useSyncExternalStore (same reference if storage unchanged). */
export function getWatchlistSnapshot(): string[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const key = raw ?? "";
  if (key === snapshotKey) return snapshotVal;
  snapshotKey = key;
  snapshotVal = parseWatchlistJson(raw);
  return snapshotVal;
}

export function writeWatchlistToStorage(symbols: string[]): void {
  if (typeof window === "undefined") return;
  const json = JSON.stringify(symbols);
  window.localStorage.setItem(STORAGE_KEY, json);
  snapshotKey = json;
  snapshotVal = [...symbols];
  window.dispatchEvent(new CustomEvent(WATCHLIST_CHANGED_EVENT));
}

export function subscribeWatchlist(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      snapshotKey = null;
      onChange();
    }
  };
  const onLocal = () => {
    snapshotKey = null;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(WATCHLIST_CHANGED_EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(WATCHLIST_CHANGED_EVENT, onLocal);
  };
}

export function watchlistStorageKey(): string {
  return STORAGE_KEY;
}
