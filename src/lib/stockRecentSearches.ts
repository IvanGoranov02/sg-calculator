const STORAGE_KEY = "sg-stock-recent-v1";
export const RECENT_STOCK_SEARCH_MAX = 8;

export const RECENT_STOCK_SEARCH_CHANGED_EVENT = "sg-stock-recent-changed";

export type RecentStockSearch = {
  symbol: string;
  name?: string;
};

let snapshotKey: string | null = null;
let snapshotVal: RecentStockSearch[] = [];

function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

export function parseRecentStockSearchesJson(json: string | null): RecentStockSearch[] {
  if (!json) return [];
  try {
    const data = JSON.parse(json) as unknown;
    if (!Array.isArray(data)) return [];
    const out: RecentStockSearch[] = [];
    for (const item of data) {
      if (typeof item === "string") {
        const symbol = normalizeSymbol(item);
        if (symbol && !out.some((r) => r.symbol === symbol)) {
          out.push({ symbol });
        }
      } else if (item && typeof item === "object") {
        const sym = (item as { symbol?: unknown }).symbol;
        if (typeof sym !== "string") continue;
        const symbol = normalizeSymbol(sym);
        if (!symbol || out.some((r) => r.symbol === symbol)) continue;
        const nameRaw = (item as { name?: unknown }).name;
        const name = typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : undefined;
        out.push({ symbol, name });
      }
      if (out.length >= RECENT_STOCK_SEARCH_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function readRecentStockSearchesFromStorage(): RecentStockSearch[] {
  if (typeof window === "undefined") return [];
  return parseRecentStockSearchesJson(window.localStorage.getItem(STORAGE_KEY));
}

export function getRecentStockSearchesSnapshot(): RecentStockSearch[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const key = raw ?? "";
  if (key === snapshotKey) return snapshotVal;
  snapshotKey = key;
  snapshotVal = parseRecentStockSearchesJson(raw);
  return snapshotVal;
}

export function writeRecentStockSearchesToStorage(entries: RecentStockSearch[]): void {
  if (typeof window === "undefined") return;
  const json = JSON.stringify(entries.slice(0, RECENT_STOCK_SEARCH_MAX));
  window.localStorage.setItem(STORAGE_KEY, json);
  snapshotKey = json;
  snapshotVal = [...entries.slice(0, RECENT_STOCK_SEARCH_MAX)];
  window.dispatchEvent(new CustomEvent(RECENT_STOCK_SEARCH_CHANGED_EVENT));
}

export function pushRecentStockSearch(symbol: string, name?: string | null): void {
  const sym = normalizeSymbol(symbol);
  if (!sym) return;
  const trimmedName = name?.trim() || undefined;
  const prev = readRecentStockSearchesFromStorage().filter((r) => r.symbol !== sym);
  const next: RecentStockSearch[] = [{ symbol: sym, name: trimmedName }, ...prev].slice(
    0,
    RECENT_STOCK_SEARCH_MAX,
  );
  writeRecentStockSearchesToStorage(next);
}

export function subscribeRecentStockSearches(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  const onCustom = () => onChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(RECENT_STOCK_SEARCH_CHANGED_EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(RECENT_STOCK_SEARCH_CHANGED_EVENT, onCustom);
  };
}
