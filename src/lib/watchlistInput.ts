import { normalizeTicker, WATCHLIST_MAX } from "@/lib/watchlistStorage";

/** null means malformed input, rather than a request to erase the saved list. */
export function parseWatchlistInput(raw: unknown): string[] | null {
  if (raw === null || typeof raw !== "object") return null;
  const symbols = (raw as { symbols?: unknown }).symbols;
  if (!Array.isArray(symbols) || !symbols.every((s) => typeof s === "string")) return null;
  const normalized = [...new Set(symbols.map(normalizeTicker))];
  if (normalized.some((s) => !s) || normalized.length > WATCHLIST_MAX) return null;
  return normalized;
}
