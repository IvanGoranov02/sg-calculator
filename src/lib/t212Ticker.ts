/**
 * Map Trading 212 instrument tickers (e.g. AAPL_US_EQ, MSFTd_EQ, BPl_EQ) to Yahoo-style symbols.
 *
 * T212 appends a lowercase exchange letter before `_EQ` (l = London, d = Xetra, a = Amsterdam, …)
 * or a `_US`-style country code for US listings. German venues often truncate symbols to 3 chars
 * on Yahoo (MSFT → MSF.DE, AMZN → AMZ.DE). US companies on EU exchanges use a different listing
 * ticker than Nasdaq — those must stay distinct so both legs appear in Holdings.
 */

/** Lowercase exchange letter (before `_EQ`) → Yahoo suffix. */
const T212_EXCHANGE_SUFFIX: Record<string, string> = {
  a: ".AS", // Amsterdam
  b: ".BR", // Brussels
  c: ".CO", // Copenhagen
  d: ".DE", // Xetra / Deutsche Börse
  e: ".MC", // Madrid
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
  w: ".WA", // Warsaw
  x: ".ST", // Stockholm
};

/** ISO country code from `_US_EQ` / `_DE_EQ` tickers → Yahoo suffix (empty = US/Nasdaq). */
const T212_COUNTRY_YAHOO_SUFFIX: Record<string, string | null> = {
  US: null,
  UK: ".L",
  GB: ".L",
  DE: ".DE",
  NL: ".AS",
  FR: ".PA",
  CH: ".SW",
  IT: ".MI",
  ES: ".MC",
  SE: ".ST",
  NO: ".OL",
  DK: ".CO",
  FI: ".HE",
  BE: ".BR",
  AT: ".VI",
  IE: ".IR",
  PT: ".LS",
  CA: ".TO",
  AU: ".AX",
  HK: ".HK",
  JP: ".T",
};

const T212_COUNTRY_CODES = new Set(Object.keys(T212_COUNTRY_YAHOO_SUFFIX));

function pushUnique(out: string[], sym: string) {
  const x = sym.trim().toUpperCase();
  if (!x || out.includes(x)) return;
  out.push(x);
}

/**
 * Known German Yahoo symbols where generic 3-char truncation is wrong, or the
 * Xetra ticker is a local code rather than the US symbol (AAPL → APC.DE).
 */
const GERMAN_YAHOO_SYMBOL_OVERRIDES: Record<string, string[]> = {
  FB2A: ["FB2A.DE", "FB2A.F", "FB2AD.XC", "FB2AD.XD"],
  // Meta on Xetra trades as FB2A; META.* / MET.* are stale or missing on Yahoo.
  META: ["FB2A.DE", "FB2A.F", "FB2AD.XC", "FB2AD.XD"],
  // Alphabet Class A on Xetra trades as ABEA; generic ABE.* is a different ~€8 instrument.
  ABEA: ["ABEA.DE", "ABEA.F", "ABEAD.XC"],
  ABEC: ["ABEC.DE", "ABEC.F"],
  GOOGL: ["ABEA.DE", "ABEA.F", "ABEAD.XC"],
  GOOG: ["ABEC.DE", "ABEC.F"],
  // Uber on Xetra keeps the full UBER ticker; generic UBE.* is a different instrument.
  UBER: ["UBER.DE", "UBER.F"],
  // US names whose Xetra ticker is not the 3-char US prefix.
  AAPL: ["APC.DE", "APC.F"],
  APC: ["APC.DE", "APC.F"],
  TSLA: ["TL0.DE", "TL0.F"],
  TL0: ["TL0.DE", "TL0.F"],
  NFLX: ["NFC.DE", "NFC.F"],
  NFC: ["NFC.DE", "NFC.F"],
  INTC: ["INL.DE", "INL.F"],
  PYPL: ["2PP.DE", "2PP.F"],
  KO: ["CCC3.DE", "CCC3.F"],
  CCC3: ["CCC3.DE", "CCC3.F"],
};

/** US Nasdaq symbols that also trade on Xetra/Frankfurt under local or truncated codes. */
const US_PRIMARY_FOR_GERMAN_LISTINGS: readonly string[] = [
  "META",
  "GOOGL",
  "GOOG",
  "AAPL",
  "TSLA",
  "NFLX",
  "UBER",
  "INTC",
  "PYPL",
  "KO",
];

/** German Yahoo 3-char truncations where reverse lookup is unambiguous for T212. */
const GERMAN_TRUNCATED_US_LOGO: Record<string, string> = {
  MSF: "MSFT",
  AMZ: "AMZN",
};

/**
 * Wrong 3-char Yahoo truncations for dual-listed US names (must not be used for logos).
 * Mirrors portfolioQuoteResolve trap sets.
 */
const GERMAN_TRUNCATION_TRAP_TO_US: Record<string, string> = {
  UBE: "UBER",
  NFL: "NFLX",
  AAP: "AAPL",
  TSL: "TSLA",
  INT: "INTC",
  GOO: "GOOGL",
  ABE: "GOOGL",
};

function germanOverrideArraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

let euListingToUsLogoMapCache: Record<string, string> | null = null;

/** EU / German listing ticker → US primary symbol for FMP logo URLs. */
function euListingToUsLogoMap(): Record<string, string> {
  if (euListingToUsLogoMapCache) return euListingToUsLogoMapCache;

  const map: Record<string, string> = {
    ...GERMAN_TRUNCATED_US_LOGO,
    ...GERMAN_TRUNCATION_TRAP_TO_US,
  };

  for (const usPrimary of US_PRIMARY_FOR_GERMAN_LISTINGS) {
    const syms = GERMAN_YAHOO_SYMBOL_OVERRIDES[usPrimary];
    if (!syms) continue;
    map[usPrimary] = usPrimary;
    for (const yahoo of syms) {
      const germanBase = yahoo.split(".")[0]?.toUpperCase();
      if (germanBase) map[germanBase] = usPrimary;
    }
  }

  for (const [localKey, syms] of Object.entries(GERMAN_YAHOO_SYMBOL_OVERRIDES)) {
    if (US_PRIMARY_FOR_GERMAN_LISTINGS.includes(localKey)) continue;
    for (const usPrimary of US_PRIMARY_FOR_GERMAN_LISTINGS) {
      const usSyms = GERMAN_YAHOO_SYMBOL_OVERRIDES[usPrimary];
      if (usSyms && germanOverrideArraysEqual(usSyms, syms)) {
        map[localKey.toUpperCase()] = usPrimary;
        break;
      }
    }
  }

  // Full-ticker Xetra listings (MSFT.DE) and legacy MSFTD / AMZD portfolio keys.
  map.MSFT = "MSFT";
  map.AMZN = "AMZN";
  map.AMZD = "AMZN";

  for (const [key, usPrimary] of Object.entries(map)) {
    const ku = key.toUpperCase();
    if (ku.endsWith("D")) continue;
    const stubKey = `${ku}D`;
    if (isUppercaseXetraStub(stubKey)) {
      map[stubKey] = usPrimary;
    }
  }

  euListingToUsLogoMapCache = map;
  return map;
}

/**
 * Resolve a normalized ticker (no exchange suffix) to the US primary symbol for FMP logos.
 * Leaves genuine US tickers unchanged (e.g. GILD is not treated as a Xetra stub).
 */
export function usPrimarySymbolForLogo(normalizedBase: string): string {
  const base = normalizedBase.trim().toUpperCase();
  if (!base) return base;

  const map = euListingToUsLogoMap();
  const direct = map[base];
  if (direct) return direct;

  if (isUppercaseXetraStub(base)) {
    const stripped = base.slice(0, -1);
    const fromStub = map[stripped];
    if (fromStub) return fromStub;
  }

  // T212 lowercase Xetra suffix on 3-char local codes (NFCd → NFCD).
  if (/^[A-Z0-9]{3}D$/.test(base)) {
    const fromLocal = map[base.slice(0, -1)];
    if (fromLocal) return fromLocal;
  }

  return base;
}

const EUR_LISTING_SUFFIX =
  /\.(DE|PA|AS|MI|F|BR|VI|ST|OL|SW|XC|XD|DU|HM|MU|BE|MC|LS|IC|WA|CO|IR|AT|HA|HE)$/i;

const VENUE_LABEL: Record<string, string> = {
  ".DE": "Xetra",
  ".F": "Frankfurt",
  ".L": "LSE",
  ".AS": "Amsterdam",
  ".PA": "Paris",
  ".SW": "Swiss",
  ".MI": "Milan",
  ".MC": "Madrid",
  ".BR": "Brussels",
  ".VI": "Vienna",
  ".ST": "Stockholm",
  ".OL": "Oslo",
  ".HE": "Helsinki",
  ".IR": "Dublin",
  ".LS": "Lisbon",
  ".TO": "Toronto",
  ".AX": "ASX",
  ".HK": "HKEX",
  ".T": "Tokyo",
  ".WA": "Warsaw",
  ".CO": "Copenhagen",
};

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

/** True when a T212 body looks like a legacy uppercase Xetra stub (`UBERD`, `NFLXD`). */
export function isUppercaseXetraStub(body: string): boolean {
  const u = body.trim().toUpperCase();
  // 4+ char US root + trailing D, e.g. UBERD / AAPLD. 3-char GOLD stays untouched.
  return /^[A-Z0-9]{4,}D$/.test(u);
}

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
        const mapped = T212_COUNTRY_YAHOO_SUFFIX[code];
        if (mapped) yahooSuffix = mapped;
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

  // Legacy uppercase Xetra stubs (FB2AD_EQ, NFLXD_EQ). Skip when _US/_DE was already parsed (GILD_US_EQ).
  const upperBody = body.toUpperCase();
  if (!isNonUsListing && !countryCodeConsumed && isUppercaseXetraStub(upperBody)) {
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
  // Keep the listing-specific identity even when truncation is preferred for quotes.
  if (isNonUsListing && yahooSuffix) {
    pushUnique(out, `${base}${yahooSuffix}`);
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

/**
 * Stored portfolio Yahoo key for a T212 ticker.
 * Non-US listings always keep an exchange suffix so Nasdaq and EU legs do not collide.
 */
export function t212TickerToYahoo(ticker: string): string {
  const { base, yahooSuffix, isNonUsListing } = parseT212Ticker(ticker);
  if (!base) {
    return ticker.trim().replace(/_EQ$/i, "").replace(/_/g, "-").toUpperCase();
  }
  if (isNonUsListing) {
    const suffix = yahooSuffix ?? ".DE";
    // Prefer known local Xetra codes (AAPL → APC.DE). Otherwise keep the full
    // T212 base + venue so Nasdaq `MSFT` and Xetra `MSFT.DE` stay two rows.
    const override = GERMAN_YAHOO_SYMBOL_OVERRIDES[base];
    if (override?.[0]) return override[0].toUpperCase();
    return `${base}${suffix}`.toUpperCase();
  }
  const candidates = t212TickerToYahooCandidates(ticker);
  return candidates[0] ?? base;
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
  if (suf === ".AX") return "AUD";
  if (suf === ".HK") return "HKD";
  if (suf === ".T") return "JPY";
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
    suf === ".BR" ||
    suf === ".MC" ||
    suf === ".LS" ||
    suf === ".CO" ||
    suf === ".WA"
  ) {
    return "EUR";
  }
  const fb = fallback.trim().toUpperCase().slice(0, 3);
  return fb || "USD";
}

/** Short venue label for Holdings (Nasdaq vs Xetra, etc.). */
export function t212ListingVenueLabel(symbolT212: string | null | undefined): string | null {
  if (!symbolT212?.trim()) return null;
  const parsed = parseT212Ticker(symbolT212);
  if (!parsed.base) return null;
  if (!parsed.isNonUsListing) return "Nasdaq";
  if (parsed.yahooSuffix && VENUE_LABEL[parsed.yahooSuffix]) return VENUE_LABEL[parsed.yahooSuffix];
  return "EU";
}
