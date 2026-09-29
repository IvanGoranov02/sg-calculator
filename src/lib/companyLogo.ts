/**
 * Company logo URLs via FMP's public image endpoint (same provider as fundamentals).
 * Strips exchange suffixes so e.g. VOW3.DE resolves to VOW3.
 * EU-listed US names (Xetra mnemonics, LSE/Euronext local codes, ISINs) resolve to the
 * US composite ticker so FMP serves the real logo. See euCrossListingLogos.json.
 */

import { parseT212Ticker, t212TickerToYahoo, usPrimarySymbolForLogo } from "@/lib/t212Ticker";

const FMP_LOGO_BASE = "https://financialmodelingprep.com/image-stock";

/** Xetra, Frankfurt, and other Deutsche Börse venues that use local mnemonics. */
const GERMAN_LISTING_SUFFIX = /\.(DE|F|DU|HM|MU|BE|HA|XC|XD)$/i;

/** Non-German EU venues. Brussels is .BR; .BE above is Berlin. */
const EU_LISTING_SUFFIX = /\.(L|PA|AS|BR|MI|SW|MC|VI|ST|OL|CO|HE|WA|IR|LS|IC|AT)$/i;

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

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

function isGermanListingSymbol(symbol: string): boolean {
  if (GERMAN_LISTING_SUFFIX.test(symbol)) return true;
  if (/_EQ$/i.test(symbol)) {
    const parsed = parseT212Ticker(symbol);
    return parsed.yahooSuffix === ".DE" || parsed.yahooSuffix === ".F";
  }
  return false;
}

function listingVenueFlags(symbol: string): { germanVenue: boolean; euVenue: boolean } {
  const germanVenue = isGermanListingSymbol(symbol);
  if (germanVenue) return { germanVenue: true, euVenue: true };
  if (EU_LISTING_SUFFIX.test(symbol)) return { germanVenue: false, euVenue: true };
  if (/_EQ$/i.test(symbol)) {
    const parsed = parseT212Ticker(symbol);
    if (parsed.yahooSuffix) return { germanVenue: false, euVenue: true };
  }
  return { germanVenue: false, euVenue: false };
}

export function fmpLogoSymbol(symbol: string): string {
  const raw = symbol.trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (ISIN_RE.test(upper)) return usPrimarySymbolForLogo(upper);

  const venue = listingVenueFlags(raw);
  if (/_EQ$/i.test(raw)) {
    return usPrimarySymbolForLogo(germanYahooBaseForLogo(raw), venue);
  }
  return usPrimarySymbolForLogo(normalizeLogoSymbolInput(symbol), venue);
}

export function companyLogoUrl(symbol: string): string {
  const sym = fmpLogoSymbol(symbol);
  return `${FMP_LOGO_BASE}/${encodeURIComponent(sym)}.png`;
}
