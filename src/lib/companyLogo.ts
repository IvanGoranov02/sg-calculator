/**
 * Company logo URLs via FMP's public image endpoint (same provider as fundamentals).
 * Strips exchange suffixes so e.g. VOW3.DE resolves to VOW3.
 * Maps EU-listed US tickers (Xetra stubs, German truncations) to US primary symbols
 * so FMP returns the correct logo (e.g. FB2AD → META).
 */

const FMP_LOGO_BASE = "https://financialmodelingprep.com/image-stock";

/**
 * EU listing / Yahoo alias → US primary symbol for FMP logo lookup.
 * Mirrors Xetra stub handling in t212Ticker / portfolioQuoteResolve.
 */
const EU_TO_US_LOGO_SYMBOL: Record<string, string> = {
  FB2A: "META",
  FB2AD: "META",
  METAD: "META",
  ABEA: "GOOGL",
  ABEAD: "GOOGL",
  AMZD: "AMZN",
  AMZ: "AMZN",
  MSFTD: "MSFT",
  MSF: "MSFT",
  UBERD: "UBER",
};

function normalizeLogoSymbolInput(symbol: string): string {
  let s = symbol.trim().toUpperCase();
  if (s.endsWith("-EQ")) s = s.slice(0, -3);
  if (s.endsWith("_EQ")) s = s.slice(0, -3);
  const dot = s.indexOf(".");
  if (dot > 0) s = s.slice(0, dot);
  return s.replace(/_/g, "-");
}

export function fmpLogoSymbol(symbol: string): string {
  const base = normalizeLogoSymbolInput(symbol);
  return EU_TO_US_LOGO_SYMBOL[base] ?? base;
}

export function companyLogoUrl(symbol: string): string {
  const sym = fmpLogoSymbol(symbol);
  return `${FMP_LOGO_BASE}/${encodeURIComponent(sym)}.png`;
}
