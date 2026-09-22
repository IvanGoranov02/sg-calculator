/**
 * Company logo URLs via FMP's public image endpoint (same provider as fundamentals).
 * Strips exchange suffixes so e.g. VOW3.DE resolves to VOW3.
 * Maps EU-listed US tickers (Xetra stubs, German truncations) to US primary symbols
 * via the same German listing table as quote resolution (t212Ticker).
 */

import { usPrimarySymbolForLogo } from "@/lib/t212Ticker";

const FMP_LOGO_BASE = "https://financialmodelingprep.com/image-stock";

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
  return usPrimarySymbolForLogo(base);
}

export function companyLogoUrl(symbol: string): string {
  const sym = fmpLogoSymbol(symbol);
  return `${FMP_LOGO_BASE}/${encodeURIComponent(sym)}.png`;
}
