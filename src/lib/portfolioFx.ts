/**
 * FX helpers for portfolio P/L (client-safe — no Node/Yahoo imports).
 */

export type PortfolioFxRates = {
  /** EUR per 1 USD (same convention as stock bundle eurPerUsd). */
  eurPerUsd: number | null;
  /** GBP per 1 USD. */
  gbpPerUsd: number | null;
  /** USD per 1 unit of another ISO currency (CHF, CAD, AUD, HKD, JPY). */
  usdPerUnit?: Partial<Record<string, number | null>>;
};

/** Official BGN↔EUR peg: 1 EUR = 1.95583 BGN (Bulgaria euro adoption, fixed rate). */
export const BGN_PER_EUR = 1.95583;

export function normalizePortfolioCurrency(raw: string | null | undefined): string {
  const c = (raw ?? "USD").trim().toUpperCase();
  if (c === "GBX") return "GBP";
  if (c.length >= 3) return c.slice(0, 3);
  return "USD";
}

/** True when Yahoo reports a pence-denominated UK quote (GBp). */
export function isPenceQuoteCurrency(raw: string | null | undefined): boolean {
  const c = (raw ?? "").trim();
  return c === "GBp" || c === "GBX";
}

/**
 * Quote currency in major units. Yahoo's `GBp`/`GBX` is pence (100 per pound),
 * not a third ISO currency next to GBP.
 */
export function quoteCurrencyMajor(raw: string | null | undefined): { code: string; minorPerMajor: number } {
  if (isPenceQuoteCurrency(raw)) return { code: "GBP", minorPerMajor: 100 };
  const c = (raw ?? "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(c)) return { code: c, minorPerMajor: 1 };
  return { code: "", minorPerMajor: 1 };
}

/**
 * Annual dividend rate in major units.
 * LSE ex-div events and the price are pence, but Yahoo's `dividendRate` is
 * usually already pounds (it matches the yield against price/100). Divide only
 * when the pence reading is a plausible yield and the pound reading is not.
 */
export function dividendRateToMajorUnits(
  rate: number | null | undefined,
  price: number | null | undefined,
  currency: string | null | undefined,
): number | null {
  if (rate == null || !Number.isFinite(rate)) return rate ?? null;
  const { minorPerMajor } = quoteCurrencyMajor(currency);
  if (minorPerMajor === 1) return rate;
  const px = price != null && Number.isFinite(price) && price > 0 ? price : null;
  if (px == null) return rate >= minorPerMajor ? rate / minorPerMajor : rate;
  const priceMajor = px / minorPerMajor;
  const yieldIfMajor = rate / priceMajor;
  const yieldIfMinor = rate / px;
  const sane = (y: number) => y >= 0.002 && y <= 0.25;
  if (sane(yieldIfMinor) && !sane(yieldIfMajor)) return rate / minorPerMajor;
  return rate;
}

/** Normalize Yahoo quote price/currency (GBp → GBP with price / 100). */
export function normalizeQuotePrice(
  price: number,
  currency: string | null | undefined,
): { price: number; currency: string } {
  if (isPenceQuoteCurrency(currency)) {
    return { price: price / 100, currency: "GBP" };
  }
  return { price, currency: normalizePortfolioCurrency(currency) };
}

/** Listing currencies for the Yahoo exchanges supported by manual and broker holdings. */
const YAHOO_EXCHANGE_CURRENCIES: Readonly<Record<string, string>> = {
  ".L": "GBP",
  ".DE": "EUR", ".F": "EUR", ".HA": "EUR", ".MU": "EUR", ".BE": "EUR",
  ".DU": "EUR", ".HM": "EUR", ".XC": "EUR", ".XD": "EUR",
  ".PA": "EUR", ".AS": "EUR", ".MI": "EUR", ".BR": "EUR", ".VI": "EUR",
  ".HE": "EUR", ".MC": "EUR", ".LS": "EUR", ".IR": "EUR", ".AT": "EUR",
  ".SW": "CHF", ".VX": "CHF",
  ".TO": "CAD", ".V": "CAD",
  ".ST": "SEK", ".OL": "NOK", ".CO": "DKK", ".WA": "PLN", ".IC": "ISK",
  ".AX": "AUD", ".NZ": "NZD", ".HK": "HKD", ".T": "JPY",
  ".PR": "CZK", ".BD": "HUF",
};

/** Null for an unknown exchange, so callers can retain an explicit currency fallback. */
export function currencyForYahooSuffix(suffix: string | null | undefined): string | null {
  return suffix ? YAHOO_EXCHANGE_CURRENCIES[suffix.trim().toUpperCase()] ?? null : null;
}

/** Guess listing currency from Yahoo-style suffix (manual entry without explicit currency). */
export function inferCurrencyFromSymbol(symbol: string): string {
  const u = symbol.trim().toUpperCase();
  const dot = u.lastIndexOf(".");
  return currencyForYahooSuffix(dot >= 0 ? u.slice(dot) : null) ?? "USD";
}

/**
 * Exchange suffix can hint a listing currency. A bare US ticker must not overwrite the
 * form's EUR default — that's how "added in euros, stored as dollars" happened.
 */
export function listingCurrencyOverride(symbol: string): string | null {
  const inferred = inferCurrencyFromSymbol(symbol);
  return inferred === "USD" ? null : inferred;
}

function usdPerListedUnit(fx: PortfolioFxRates, ccy: string): number | null {
  const rate = fx.usdPerUnit?.[ccy];
  return rate != null && rate > 0 ? rate : null;
}

/**
 * Convert `amount` from `from` to `to`. Returns null if cross-rate is unavailable.
 * Supports USD, EUR, GBP via USD bridge; BGN via the official EUR peg;
 * other ISO codes when `usdPerUnit` has a positive USD rate.
 */
export function convertPortfolioMoney(
  amount: number,
  from: string,
  to: string,
  fx: PortfolioFxRates,
): number | null {
  if (!Number.isFinite(amount)) return null;
  const f = normalizePortfolioCurrency(from);
  const t = normalizePortfolioCurrency(to);
  if (f === t) return amount;

  if (f === "BGN" && t === "EUR") return amount / BGN_PER_EUR;
  if (f === "EUR" && t === "BGN") return amount * BGN_PER_EUR;

  const toUsd = (amt: number, ccy: string): number | null => {
    if (ccy === "USD") return amt;
    if (ccy === "EUR") {
      if (fx.eurPerUsd == null || fx.eurPerUsd <= 0) return null;
      return amt / fx.eurPerUsd;
    }
    if (ccy === "GBP") {
      if (fx.gbpPerUsd == null || fx.gbpPerUsd <= 0) return null;
      return amt / fx.gbpPerUsd;
    }
    if (ccy === "BGN") {
      const eur = amt / BGN_PER_EUR;
      if (fx.eurPerUsd == null || fx.eurPerUsd <= 0) return null;
      return eur / fx.eurPerUsd;
    }
    const listed = usdPerListedUnit(fx, ccy);
    if (listed != null) return amt * listed;
    return null;
  };

  const fromUsd = (usd: number, ccy: string): number | null => {
    if (ccy === "USD") return usd;
    if (ccy === "EUR") {
      if (fx.eurPerUsd == null || fx.eurPerUsd <= 0) return null;
      return usd * fx.eurPerUsd;
    }
    if (ccy === "GBP") {
      if (fx.gbpPerUsd == null || fx.gbpPerUsd <= 0) return null;
      return usd * fx.gbpPerUsd;
    }
    if (ccy === "BGN") {
      if (fx.eurPerUsd == null || fx.eurPerUsd <= 0) return null;
      return usd * fx.eurPerUsd * BGN_PER_EUR;
    }
    const listed = usdPerListedUnit(fx, ccy);
    if (listed != null) return usd / listed;
    return null;
  };

  const usd = toUsd(amount, f);
  if (usd == null) return null;
  return fromUsd(usd, t);
}
