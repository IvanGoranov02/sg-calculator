/**
 * FX helpers for portfolio P/L (client-safe — no Node/Yahoo imports).
 */

export type PortfolioFxRates = {
  /** EUR per 1 USD (same convention as stock bundle eurPerUsd). */
  eurPerUsd: number | null;
  /** GBP per 1 USD. */
  gbpPerUsd: number | null;
};

export function normalizePortfolioCurrency(raw: string | null | undefined): string {
  const c = (raw ?? "USD").trim().toUpperCase();
  if (c === "GBX") return "GBP";
  if (c.length >= 3) return c.slice(0, 3);
  return "USD";
}

/** Guess listing currency from Yahoo-style suffix (manual entry without explicit currency). */
export function inferCurrencyFromSymbol(symbol: string): string {
  const u = symbol.trim().toUpperCase();
  if (/\.L$/.test(u)) return "GBP";
  if (/\.(DE|PA|AS|MI|BR|VI|ST|OL|F|HA|HE|MU|BE|MC|SW|LS|IC|WA|CO|IR|TO|LS|MC|AT)$/.test(u)) {
    return "EUR";
  }
  return "USD";
}

/**
 * Convert `amount` from `from` to `to`. Returns null if cross-rate is unavailable.
 * Supports USD, EUR, GBP via USD bridge.
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
    return null;
  };

  const usd = toUsd(amount, f);
  if (usd == null) return null;
  return fromUsd(usd, t);
}
