/**
 * Map Trading 212 instrument tickers (e.g. AAPL_US_EQ, BRK_B_US_EQ) to Yahoo-style symbols.
 * Heuristic: strip trailing _XX_EQ (ISO-like exchange suffix), then replace _ with -.
 */
export function t212TickerToYahoo(ticker: string): string {
  const t = ticker.trim();
  if (!t) return t;
  const withoutSuffix = t.replace(/_[A-Z]{2}_EQ$/i, "");
  return withoutSuffix.replace(/_/g, "-").toUpperCase();
}
