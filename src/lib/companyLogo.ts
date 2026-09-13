/**
 * Company logo URLs via FMP's public image endpoint (same provider as fundamentals).
 * Strips exchange suffixes so e.g. VOW3.DE resolves to VOW3.
 */
const FMP_LOGO_BASE = "https://financialmodelingprep.com/image-stock";

export function fmpLogoSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  const dot = s.indexOf(".");
  if (dot > 0) return s.slice(0, dot);
  return s;
}

export function companyLogoUrl(symbol: string): string {
  const sym = fmpLogoSymbol(symbol);
  return `${FMP_LOGO_BASE}/${encodeURIComponent(sym)}.png`;
}
