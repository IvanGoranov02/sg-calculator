/**
 * Portfolio quote selection helpers (client-safe — no Yahoo imports).
 * Keeps T212 EU listings from fail-open to US ADR/ETF traps (e.g. AMZD bear ETF).
 */

import { normalizePortfolioCurrency } from "@/lib/portfolioFx";
import { parseT212Ticker, t212TickerToYahooCandidates } from "@/lib/t212Ticker";

export type PortfolioQuotePickRow = {
  resolvedYahooSymbol?: string;
  currency: string;
  price: number;
  name: string;
  quoteType?: string | null;
};

/** Yahoo symbols that must never be used for certain T212 EU contexts. */
const KNOWN_TRAP_SYMBOLS = new Set(["AMZD", "METD"]);

/** Legacy portfolio keys for Meta on Xetra (FB2AD-EQ, METAD-EQ). */
const EU_META_STUB_KEY = /^FB2AD(-EQ)?$|^METAD(-EQ)?$/i;

/** Legacy portfolio keys for Alphabet Class A on Xetra (ABEAD-EQ). */
const EU_ALPHABET_STUB_KEY = /^ABEAD(-EQ)?$/i;

/** Wrong Yahoo symbols for Alphabet on Xetra (truncated ABE.* ≠ Class A ~€290). */
const ALPHABET_XETRA_TRAP_SYMBOLS = new Set(["ABE.F", "ABE.DE"]);

/**
 * Symbols to exclude from Yahoo fetch/search for a holding.
 * Covers legacy stored keys (AMZD) and T212-body stubs (AMZd → AMZD).
 */
export function buildBlockedYahooSymbols(
  symbolYahoo: string,
  symbolT212: string | null,
): Set<string> {
  const blocked = new Set<string>();
  const stored = symbolYahoo.trim().toUpperCase();

  if (!symbolT212) {
    if (KNOWN_TRAP_SYMBOLS.has(stored)) blocked.add(stored);
    if (EU_META_STUB_KEY.test(stored)) {
      blocked.add(stored.replace(/-EQ$/i, ""));
      for (const sym of KNOWN_TRAP_SYMBOLS) blocked.add(sym);
    }
    if (EU_ALPHABET_STUB_KEY.test(stored)) {
      blocked.add(stored.replace(/-EQ$/i, ""));
      for (const sym of ALPHABET_XETRA_TRAP_SYMBOLS) blocked.add(sym);
    }
    return blocked;
  }

  const parsed = parseT212Ticker(symbolT212);
  if (!parsed.isNonUsListing) return blocked;

  const t212Body = symbolT212.replace(/_EQ$/i, "");
  blocked.add(t212Body.replace(/_/g, "-").toUpperCase());

  if (parsed.base.length >= 2) {
    blocked.add(`${parsed.base}D`);
  }

  // Legacy keys: uppercase body ending in D without an exchange dot (MSFTD, AMZD, …).
  if (/^[A-Z0-9-]{3,}D$/.test(stored) && !stored.includes(".")) {
    blocked.add(stored);
  }

  if (/AMZd/i.test(symbolT212)) {
    blocked.add("AMZD");
  }

  if (/FB2Ad|FB2AD|METAd|METAD/i.test(symbolT212)) {
    blocked.add("METD");
  }

  if (/ABEAd|ABEAD/i.test(symbolT212)) {
    for (const sym of ALPHABET_XETRA_TRAP_SYMBOLS) blocked.add(sym);
  }

  for (const sym of KNOWN_TRAP_SYMBOLS) {
    blocked.add(sym);
  }

  return blocked;
}

export function isBlockedYahooSymbol(sym: string, blocked: Set<string>): boolean {
  return blocked.has(sym.trim().toUpperCase());
}

/** True when a Yahoo row is a known trap for this T212 listing. */
export function isTrapQuoteRow(
  row: PortfolioQuotePickRow,
  symbolT212: string | null,
  blocked: Set<string>,
): boolean {
  const sym = (row.resolvedYahooSymbol ?? "").trim().toUpperCase();
  if (!sym) return false;
  if (isBlockedYahooSymbol(sym, blocked)) return true;
  if (KNOWN_TRAP_SYMBOLS.has(sym) && symbolT212 && parseT212Ticker(symbolT212).isNonUsListing) {
    return true;
  }
  const qt = (row.quoteType ?? "").toUpperCase();
  if (qt === "ETF" && /BEAR|INVERSE|SHORT/i.test(row.name) && symbolT212) {
    const parsed = parseT212Ticker(symbolT212);
    if (parsed.isNonUsListing) return true;
  }
  return false;
}

export function quoteCurrencyScore(
  row: PortfolioQuotePickRow,
  holdingCurrency: string | null,
): number {
  const hold = holdingCurrency ? normalizePortfolioCurrency(holdingCurrency) : null;
  const quote = normalizePortfolioCurrency(row.currency);
  if (hold && hold === quote) return 2;
  if (hold === "EUR" && /\.(DE|PA|AS|MI|F|BR|VI|ST|OL|SW|XC|XD|DU|HM)$/i.test(row.resolvedYahooSymbol ?? "")) {
    return 1;
  }
  if (hold === "GBP" && (row.resolvedYahooSymbol ?? "").endsWith(".L")) return 1;
  return 0;
}

export function pickBestQuoteRow<T extends PortfolioQuotePickRow>(
  rows: T[],
  holdingCurrency: string | null,
  symbolT212: string | null,
  blocked: Set<string>,
): T | null {
  if (rows.length === 0) return null;

  const parsed = symbolT212 ? parseT212Ticker(symbolT212) : null;
  const hold = holdingCurrency ? normalizePortfolioCurrency(holdingCurrency) : null;

  const viable = rows.filter((row) => {
    if (isTrapQuoteRow(row, symbolT212, blocked)) return false;
    const score = quoteCurrencyScore(row, holdingCurrency);
    if (parsed?.isNonUsListing && score === 0) return false;
    if (hold && score === 0) {
      const quoteCcy = normalizePortfolioCurrency(row.currency);
      if (quoteCcy !== hold) return false;
    }
    return true;
  });

  if (viable.length === 0) return null;

  viable.sort((a, b) => quoteCurrencyScore(b, holdingCurrency) - quoteCurrencyScore(a, holdingCurrency));
  return viable[0] ?? null;
}

/**
 * Use broker price only when Yahoo is missing, currency-mismatched, or a trap.
 * When Yahoo matches holding currency and is sane, keep live Yahoo for price.
 */
export function shouldPreferBrokerPrice(
  best: PortfolioQuotePickRow | null,
  broker: { price: number; currency: string } | null,
  holdingCurrency: string | null,
  symbolT212: string | null,
  blocked: Set<string>,
  options?: { brokerFirst?: boolean },
): boolean {
  if (!broker) return false;
  if (options?.brokerFirst) return true;
  if (!best) return true;

  const hold = holdingCurrency ? normalizePortfolioCurrency(holdingCurrency) : null;
  const brokerCcy = normalizePortfolioCurrency(broker.currency);
  const yahooCcy = normalizePortfolioCurrency(best.currency);

  if (isTrapQuoteRow(best, symbolT212, blocked)) return true;
  if (hold != null && yahooCcy !== hold) return true;
  if (hold != null && brokerCcy === hold && quoteCurrencyScore(best, holdingCurrency) === 0) return true;

  return false;
}

/** Search query for Yahoo when the stored portfolio key is a legacy stub. */
export function searchQueryForPortfolioSymbol(
  portfolioSymbol: string,
  symbolT212: string | null,
  holdingCurrency: string | null,
): string | null {
  const parsed = symbolT212 ? parseT212Ticker(symbolT212) : null;
  if (parsed?.isNonUsListing) {
    const cands = t212TickerToYahooCandidates(symbolT212!, holdingCurrency);
    const dotted = cands.find((c) => c.includes("."));
    if (dotted) return dotted;
    return parsed.base || null;
  }
  const stripped = portfolioSymbol.replace(/-EQ$/i, "").replace(/-/g, " ");
  const q = stripped.trim();
  return q || portfolioSymbol;
}
