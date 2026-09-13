/**
 * Split an estimated annual dividend into month and day figures.
 * Month = annual / 12; day = annual / 365 (calendar, not trading days).
 */

import {
  estimateHoldingAnnualDividend,
  paymentMatchesSymbol,
  type PortfolioDividendPayment,
} from "@/lib/portfolioDividends";
import { convertPortfolioMoney, normalizePortfolioCurrency, type PortfolioFxRates } from "@/lib/portfolioFx";
import type { PortfolioQuoteRow } from "@/lib/portfolioMarketData";

export type PeriodizedDividend = {
  annual: number;
  month: number;
  day: number;
};

export function periodizeAnnualDividend(annual: number): PeriodizedDividend | null {
  if (!Number.isFinite(annual) || annual < 0) return null;
  return {
    annual,
    month: annual / 12,
    day: annual / 365,
  };
}

export type EventDividendEstimate = {
  amount: number;
  currency: string;
};

export type EventDividendHoldingInput = {
  symbolYahoo: string;
  quantity: string | number;
  currency: string;
};

const DEFAULT_PAYMENTS_PER_YEAR = 4;
const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

/** Resolve a portfolio quote by holding or event symbol (case-insensitive, includes resolved Yahoo aliases). */
export function lookupPortfolioQuote(
  quotes: Record<string, PortfolioQuoteRow | null>,
  symbol: string,
): PortfolioQuoteRow | null | undefined {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;

  const direct = quotes[symbol] ?? quotes[sym];
  if (direct) return direct;

  for (const q of Object.values(quotes)) {
    if (!q) continue;
    if (q.symbol.trim().toUpperCase() === sym) return q;
    if (q.resolvedYahooSymbol?.trim().toUpperCase() === sym) return q;
  }

  return null;
}

function holdingSymbolKeys(
  symbolYahoo: string,
  quote: PortfolioQuoteRow | null | undefined,
): string[] {
  const sym = symbolYahoo.trim().toUpperCase();
  if (!sym) return [];
  const resolved = quote?.resolvedYahooSymbol?.trim().toUpperCase();
  if (resolved && resolved !== sym) return [sym, resolved];
  return [sym];
}

function resolveCanonicalSymbol(
  symbolYahoo: string,
  quote: PortfolioQuoteRow | null | undefined,
  aliasToCanonical: Map<string, string>,
  canonicalEstimates: Map<string, EventDividendEstimate>,
): string {
  const keys = holdingSymbolKeys(symbolYahoo, quote);
  const sym = keys[0] ?? symbolYahoo.trim().toUpperCase();

  for (const key of keys) {
    const mapped = aliasToCanonical.get(key);
    if (mapped) return mapped;
  }
  for (const key of keys) {
    if (canonicalEstimates.has(key)) return key;
  }

  const canonical = sym;
  for (const key of keys) aliasToCanonical.set(key, canonical);
  return canonical;
}

/** Count dividend payments in the trailing year to infer payment frequency. */
export function inferPaymentsPerYearFromHistory(
  payments: PortfolioDividendPayment[],
  symbol: string,
  asOfMs = Date.now(),
): number {
  const cutoff = asOfMs - MS_PER_YEAR;
  let count = 0;
  for (const p of payments) {
    if (!paymentMatchesSymbol(p, symbol) || p.amount <= 0 || !Number.isFinite(p.amount)) continue;
    const t = new Date(`${p.paidOn}T12:00:00Z`).getTime();
    if (!Number.isFinite(t) || t < cutoff || t > asOfMs) continue;
    count += 1;
  }
  if (count >= 1 && count <= 12) return count;
  return DEFAULT_PAYMENTS_PER_YEAR;
}

/** Estimated cash dividend for one ex-div / pay-date event from a single holding. */
export function estimateEventDividendPayment(input: {
  symbol: string;
  quantity: string | number;
  currency: string;
  quote: PortfolioQuoteRow | null | undefined;
  fx: PortfolioFxRates;
  payments?: PortfolioDividendPayment[];
}): EventDividendEstimate | null {
  const annual = estimateHoldingAnnualDividend(
    { quantity: input.quantity, currency: input.currency },
    input.quote,
    input.fx,
  );
  if (!annual) return null;

  const paymentsPerYear = input.payments
    ? inferPaymentsPerYearFromHistory(input.payments, input.symbol)
    : DEFAULT_PAYMENTS_PER_YEAR;
  const perPayment = annual.estAnnualIncome / paymentsPerYear;
  if (!Number.isFinite(perPayment) || perPayment <= 0) return null;

  return {
    amount: perPayment,
    currency: annual.currency,
  };
}

function accumulateEventDividendEstimate(
  map: Map<string, EventDividendEstimate>,
  symbol: string,
  estimate: EventDividendEstimate,
  displayCurrency: string,
  fx: PortfolioFxRates,
): void {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return;
  const target = normalizePortfolioCurrency(displayCurrency);
  const converted = convertPortfolioMoney(estimate.amount, estimate.currency, target, fx);
  if (converted == null) return;

  const existing = map.get(sym);
  if (existing) {
    const existingConverted = convertPortfolioMoney(existing.amount, existing.currency, target, fx);
    if (existingConverted == null) return;
    map.set(sym, { amount: existingConverted + converted, currency: target });
  } else {
    map.set(sym, { amount: converted, currency: target });
  }
}

/** Build per-symbol event dividend estimates for portfolio holdings only (display currency). */
export function buildEventDividendEstimatesBySymbol(input: {
  holdings: EventDividendHoldingInput[];
  quotes: Record<string, PortfolioQuoteRow | null>;
  fx: PortfolioFxRates;
  payments?: PortfolioDividendPayment[];
  displayCurrency: string;
}): Map<string, EventDividendEstimate> {
  const canonicalEstimates = new Map<string, EventDividendEstimate>();
  const aliasToCanonical = new Map<string, string>();

  for (const h of input.holdings) {
    const sym = h.symbolYahoo.trim().toUpperCase();
    if (!sym) continue;

    const quote = lookupPortfolioQuote(input.quotes, h.symbolYahoo);
    const canonical = resolveCanonicalSymbol(h.symbolYahoo, quote, aliasToCanonical, canonicalEstimates);

    const estimate = estimateEventDividendPayment({
      symbol: sym,
      quantity: h.quantity,
      currency: h.currency,
      quote,
      fx: input.fx,
      payments: input.payments,
    });
    if (!estimate) continue;

    accumulateEventDividendEstimate(
      canonicalEstimates,
      canonical,
      estimate,
      input.displayCurrency,
      input.fx,
    );
  }

  const bySymbol = new Map(canonicalEstimates);
  for (const [alias, canonical] of aliasToCanonical) {
    if (alias === canonical) continue;
    const entry = canonicalEstimates.get(canonical);
    if (entry) bySymbol.set(alias, entry);
  }

  return bySymbol;
}
