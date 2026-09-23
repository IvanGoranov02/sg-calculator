/**
 * Company logo URLs via FMP's public image endpoint (same provider as fundamentals).
 * Strips exchange suffixes so e.g. VOW3.DE resolves to VOW3.
 * Maps EU-listed US tickers (Xetra stubs, German truncations) to US primary symbols
 * via the same German listing table as quote resolution (t212Ticker).
 */

import { t212TickerToYahoo, usPrimarySymbolForLogo } from "@/lib/t212Ticker";

const FMP_LOGO_BASE = "https://financialmodelingprep.com/image-stock";

function normalizeLogoSymbolInput(symbol: string): string {
  let s = symbol.trim().toUpperCase();
  if (s.endsWith("-EQ")) s = s.slice(0, -3);
  if (s.endsWith("_EQ")) s = s.slice(0, -3);
  const dot = s.indexOf(".");
  if (dot > 0) s = s.slice(0, dot);
  return s.replace(/_/g, "-");
}

function germanYahooBaseForLogo(symbol: string): string {
  const yahoo = t212TickerToYahoo(symbol).trim().toUpperCase();
  const dot = yahoo.indexOf(".");
  return dot > 0 ? yahoo.slice(0, dot) : yahoo;
}

export function fmpLogoSymbol(symbol: string): string {
  const raw = symbol.trim();
  if (/_EQ$/i.test(raw)) {
    return usPrimarySymbolForLogo(germanYahooBaseForLogo(raw));
  }
  const base = normalizeLogoSymbolInput(symbol);
  return usPrimarySymbolForLogo(base);
}

export function companyLogoUrl(symbol: string): string {
  const sym = fmpLogoSymbol(symbol);
  return `${FMP_LOGO_BASE}/${encodeURIComponent(sym)}.png`;
}
