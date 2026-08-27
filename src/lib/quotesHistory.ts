/** Max symbols per history request (tighter than watchlist cap — Yahoo is slow). */
export const QUOTES_HISTORY_MAX_SYMBOLS = 25;

const SYMBOL_RE = /^[A-Z0-9.\-^]+$/;

export function parseQuotesHistorySymbols(raw: string, max = QUOTES_HISTORY_MAX_SYMBOLS): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => SYMBOL_RE.test(s)),
    ),
  ).slice(0, max);
}
