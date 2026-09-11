/**
 * Map Trading 212 instrument tickers (e.g. AAPL_US_EQ, MSFTd_EQ, BPl_EQ) to Yahoo-style symbols.
 *
 * T212 appends a lowercase exchange letter before `_EQ` (l = London, d = Xetra, a = Amsterdam, …)
 * or a `_US`-style country code for US listings. German venues often truncate symbols to 3 chars
 * on Yahoo (MSFT → MSF.DE, AMZN → AMZ.DE).
 */

/** Lowercase exchange letter (before `_EQ`) → Yahoo suffix. */
const T212_EXCHANGE_SUFFIX: Record<string, string> = {
  a: ".AS", // Amsterdam
  d: ".DE", // Xetra / Deutsche Börse
  f: ".F", // Frankfurt
  h: ".HE", // Helsinki
  i: ".IR", // Dublin
  l: ".L", // London
  m: ".MI", // Milan
  o: ".OL", // Oslo
  p: ".PA", // Paris
  s: ".SW", // Swiss
  t: ".TO", // Toronto
  v: ".VI", // Vienna
  x: ".ST", // Stockholm
};

const T212_COUNTRY_CODES = new Set([
  "US",
  "UK",
  "DE",
  "FR",
  "NL",
  "CH",
  "IT",
  "ES",
  "SE",
  "NO",
  "DK",
  "FI",
  "BE",
  "AT",
  "IE",
  "PT",
  "CA",
  "AU",
  "HK",
  "JP",
]);

/** Legacy uppercase Xetra venue stubs (FB2AD_EQ), not US tickers ending in D (GILD_US_EQ). */
const UPPERCASE_XETRA_STUBS = new Set(["FB2AD", "METAD", "MSFTD", "AMZD", "ABEAD"]);

function pushUnique(out: string[], sym: string) {
  const x = sym.trim().toUpperCase();
  if (!x || out.includes(x)) return;
  out.push(x);
}

/** Known German Yahoo symbols where generic 3-char truncation is wrong (FB2A → FB2.DE). */
const GERMAN_YAHOO_SYMBOL_OVERRIDES: Record<string, string[]> = {
  FB2A: ["FB2A.DE", "FB2A.F", "FB2AD.XC", "FB2AD.XD"],
  // Meta on Xetra trades as FB2A; META.* / MET.* are stale or missing on Yahoo.
  META: ["FB2A.DE", "FB2A.F", "FB2AD.XC", "FB2AD.XD"],
  // Alphabet Class A on Xetra trades as ABEA; generic ABE.* is a different ~€8 instrument.
  ABEA: ["ABEA.DE", "ABEA.F", "ABEAD.XC"],
};

const EUR_LISTING_SUFFIX =
  /\.(DE|PA|AS|MI|F|BR|VI|ST|OL|SW|XC|XD|DU|HM|MU|BE|MC|LS|IC|WA|CO|IR|AT|HA|HE)$/i;

/** Yahoo symbols for German listings (Xetra / Frankfurt), including 3-char truncation. */
export function germanListingYahooSymbols(base: string): string[] {
  const b = base.trim().toUpperCase();
  if (!b) return [];
  const override = GERMAN_YAHOO_SYMBOL_OVERRIDES[b];
  if (override) {
    const out: string[] = [];
    for (const sym of override) pushUnique(out, sym);
    return out;
  }
  const out: string[] = [];
  // Do not truncate tickers with digits (FB2A → FB2.* is invalid on Yahoo).
  if (b.length > 3 && !/[0-9]/.test(b)) {
    const short = b.slice(0, 3);
    pushUnique(out, `${short}.DE`);
    pushUnique(out, `${short}.F`);
  }
  pushUnique(out, `${b}.DE`);
  pushUnique(out, `${b}.F`);
  return out;
}

function listingSymbolsForExchange(base: string, yahooSuffix: string): string[] {
  const b = base.trim().toUpperCase().replace(/_/g, "-");
  if (!b) return [];
  const out: string[] = [];
  if (yahooSuffix === ".DE" || yahooSuffix === ".F") {
    // German venues often use a 3-char prefix on Yahoo (MSFT → MSF.DE).
    for (const g of germanListingYahooSymbols(b)) pushUnique(out, g);
  } else {
    pushUnique(out, `${b}${yahooSuffix}`);
  }
  return out;
}

export type T212ParsedTicker = {
  /** Base symbol with underscores → hyphens, no exchange/country suffix. */
  base: string;
  /** Yahoo suffix from exchange letter, e.g. ".DE", ".L", or null for US / unknown. */
  yahooSuffix: string | null;
  /** True when the T212 ticker clearly refers to a non-US listing. */
  isNonUsListing: boolean;
};

/** Parse a T212 API ticker into base symbol and listing hints. */
export function parseT212Ticker(ticker: string): T212ParsedTicker {
  const t = ticker.trim();
  if (!t) return { base: "", yahooSuffix: null, isNonUsListing: false };

  let body = t.replace(/_EQ$/i, "");
  let yahooSuffix: string | null = null;
  let isNonUsListing = false;
  let countryCodeConsumed = false;

  const countryMatch = body.match(/^(.+)_([A-Z]{2})$/i);
  if (countryMatch) {
    const code = countryMatch[2].toUpperCase();
    if (T212_COUNTRY_CODES.has(code)) {
      body = countryMatch[1];
      countryCodeConsumed = true;
      if (code !== "US") {
        isNonUsListing = true;
        if (code === "UK") yahooSuffix = ".L";
        else if (code === "DE") yahooSuffix = ".DE";
        else if (code === "NL") yahooSuffix = ".AS";
        else if (code === "FR") yahooSuffix = ".PA";
        else if (code === "CH") yahooSuffix = ".SW";
        else if (code === "IT") yahooSuffix = ".MI";
      }
    }
  }

  const last = body.slice(-1);
  if (/[a-z]/.test(last)) {
    const mapped = T212_EXCHANGE_SUFFIX[last];
    if (mapped) {
      body = body.slice(0, -1);
      yahooSuffix = mapped;
      isNonUsListing = true;
    }
  }

  // Legacy uppercase Xetra stubs (FB2AD_EQ). Skip when _US/_DE was already parsed (GILD_US_EQ).
  const upperBody = body.toUpperCase();
  if (
    !isNonUsListing &&
    !countryCodeConsumed &&
    UPPERCASE_XETRA_STUBS.has(upperBody)
  ) {
    body = body.slice(0, -1);
    yahooSuffix = ".DE";
    isNonUsListing = true;
  }

  const base = body.replace(/_/g, "-").toUpperCase();
  return { base, yahooSuffix, isNonUsListing };
}

/**
 * Ordered Yahoo symbol candidates for a T212 ticker (most specific first).
 * Pass `holdingCurrency` to rank same-currency listings ahead of ADR/US fallbacks.
 */
export function t212TickerToYahooCandidates(
  ticker: string,
  holdingCurrency?: string | null,
): string[] {
  const { base, yahooSuffix, isNonUsListing } = parseT212Ticker(ticker);
  if (!base) return [];

  const out: string[] = [];
  if (yahooSuffix) {
    for (const s of listingSymbolsForExchange(base, yahooSuffix)) pushUnique(out, s);
  }
  pushUnique(out, base);

  // Legacy stub without exchange letter but with -EQ in stored Yahoo key.
  if (base.endsWith("A") && base.length >= 5) {
    pushUnique(out, `${base.slice(0, -1)}.AS`);
  }

  if (!isNonUsListing) {
    for (const suf of [".DE", ".L", ".PA", ".AS", ".SW", ".MI", ".F"]) {
      pushUnique(out, `${base}${suf}`);
    }
    if (base.length > 2 && /[A-Z]D$/.test(base)) {
      pushUnique(out, base.slice(0, -1));
    }
  }

  const want = holdingCurrency?.trim().toUpperCase().slice(0, 3);
  if (!want || want === "USD") return out;

  const prefer = new Set<string>();
  const rest: string[] = [];
  for (const sym of out) {
    if (
      (want === "EUR" && EUR_LISTING_SUFFIX.test(sym)) ||
      (want === "GBP" && /\.L$/i.test(sym)) ||
      (want === "CHF" && /\.SW$/i.test(sym))
    ) {
      prefer.add(sym);
    } else {
      rest.push(sym);
    }
  }
  return [...prefer, ...rest.filter((s) => !prefer.has(s))];
}

/** Best-effort primary Yahoo symbol for a T212 ticker. */
export function t212TickerToYahoo(ticker: string): string {
  const candidates = t212TickerToYahooCandidates(ticker);
  return candidates[0] ?? ticker.trim().replace(/_EQ$/i, "").replace(/_/g, "-").toUpperCase();
}

/**
 * Listing currency for Yahoo quote resolution (instrument listing, not wallet/account).
 * Using wallet currency here mis-ranks US tickers toward EU listings (e.g. META → FB2A.DE).
 */
export function t212QuoteCurrency(symbolT212: string | null, fallback = "USD"): string {
  if (!symbolT212) return fallback.trim().toUpperCase().slice(0, 3) || "USD";
  const parsed = parseT212Ticker(symbolT212);
  if (!parsed.isNonUsListing) return "USD";
  const suf = parsed.yahooSuffix;
  if (suf === ".L") return "GBP";
  if (suf === ".SW") return "CHF";
  if (suf === ".TO") return "CAD";
  if (
    suf === ".DE" ||
    suf === ".F" ||
    suf === ".PA" ||
    suf === ".AS" ||
    suf === ".MI" ||
    suf === ".VI" ||
    suf === ".ST" ||
    suf === ".OL" ||
    suf === ".HE" ||
    suf === ".HA" ||
    suf === ".IR" ||
    suf === ".BR"
  ) {
    return "EUR";
  }
  const fb = fallback.trim().toUpperCase().slice(0, 3);
  return fb || "USD";
}
