/** Typical Yahoo symbols: Latin letters, digits, dot, hyphen (rejects Cyrillic etc.). */
const TICKER_INPUT_RE = /^[A-Za-z0-9.\-]{1,32}$/;

export const INVALID_TICKER_SYMBOL_MESSAGE =
  "Invalid ticker: use Latin letters, numbers, dot or hyphen only.";

export function isValidStockSymbolInput(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  return TICKER_INPUT_RE.test(s);
}

export function normalizeStockSymbol(raw: string): string {
  return raw.trim().toUpperCase() || "AAPL";
}
