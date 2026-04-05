/**
 * Map Trading 212 instrument tickers (e.g. AAPL_US_EQ, AMZd_EQ, BRK_B_US_EQ) to Yahoo-style symbols.
 * Heuristic: strip `_EQ`, then optional `_XX` exchange code, then `_` → `-`.
 */
export function t212TickerToYahoo(ticker: string): string {
  const t = ticker.trim();
  if (!t) return t;
  let s = t.replace(/_EQ$/i, "");
  s = s.replace(/_[A-Z]{2}$/i, "");
  return s.replace(/_/g, "-").toUpperCase();
}
