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

/** Ex-div estimate and optional pay-date amount from the latest portfolio dividend. */
export type SymbolEventDividendEstimates = {
  estimate: EventDividendEstimate;
  confirmed: EventDividendEstimate | null;
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
  canonicalEstimates: Map<string, SymbolEventDividendEstimates>,
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

function trailingYearPaymentTotals(
  payments: PortfolioDividendPayment[],
  symbol: string,
  asOfMs: number,
): number[] {
  const cutoff = asOfMs - MS_PER_YEAR;
  const totals: number[] = [];
  for (const p of payments) {
    if (!paymentMatchesSymbol(p, symbol) || p.amount <= 0 || !Number.isFinite(p.amount)) continue;
    const t = new Date(`${p.paidOn}T12:00:00Z`).getTime();
    if (!Number.isFinite(t) || t < cutoff || t > asOfMs) continue;
    totals.push(p.amount);
  }
  return totals;
}

/** Most recent portfolio dividend payment, as cash per share at current quantity. */
export function latestPerShareCashDividendFromPayments(
  payments: PortfolioDividendPayment[],
  symbol: string,
  quantity: number | string,
  asOfMs = Date.now(),
): number | null {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) return null;

  let latest: { t: number; perShare: number } | null = null;
  for (const p of payments) {
    if (!paymentMatchesSymbol(p, symbol) || p.amount <= 0 || !Number.isFinite(p.amount)) continue;
    const t = new Date(`${p.paidOn}T12:00:00Z`).getTime();
    if (!Number.isFinite(t) || t > asOfMs) continue;
    const perShare = p.amount / qty;
    if (!Number.isFinite(perShare) || perShare <= 0) continue;
    if (!latest || t > latest.t) latest = { t, perShare };
  }
  return latest?.perShare ?? null;
}

export type InferPaymentsPerYearOptions = {
  asOfMs?: number;
  quantity?: number | string;
  /** Holding annual dividend cash (trailing rate × shares). */
  annualIncome?: number | null;
  /** Trailing annual dividend per share from the quote. */
  annualPerShare?: number | null;
};

/**
 * Infer how many dividends are paid per year.
 * Uses declared annual DPS vs last cash dividend per share — not raw payment count
 * (partial-year history would skew frequency).
 */
export function inferPaymentsPerYearFromHistory(
  payments: PortfolioDividendPayment[],
  symbol: string,
  options: InferPaymentsPerYearOptions = {},
): number {
  const asOfMs = options.asOfMs ?? Date.now();
  const totals = trailingYearPaymentTotals(payments, symbol, asOfMs);
  if (totals.length === 0) return DEFAULT_PAYMENTS_PER_YEAR;

  const count = totals.length;
  const qty = Number(options.quantity ?? NaN);
  const annualPerShare = options.annualPerShare;
  if (annualPerShare != null && annualPerShare > 0 && Number.isFinite(qty) && qty > 0) {
    const lastPerShare = latestPerShareCashDividendFromPayments(payments, symbol, qty, asOfMs);
    if (lastPerShare != null && lastPerShare > 0) {
      const implied = annualPerShare / lastPerShare;
      const rounded = Math.round(implied);
      if (rounded >= 1 && rounded <= 12 && Math.abs(implied - rounded) <= 0.35) {
        const expectedPerEvent = annualPerShare / rounded;
        const relDiff = Math.abs(lastPerShare - expectedPerEvent) / expectedPerEvent;
        // Partial-year history (e.g. two quarters) should not halve quarterly DPS.
        if (
          relDiff <= 0.15 &&
          rounded === DEFAULT_PAYMENTS_PER_YEAR &&
          count < rounded &&
          count <= 2
        ) {
          return rounded;
        }
      }
    }
  }

  if (count > 12) return DEFAULT_PAYMENTS_PER_YEAR;
  if (count >= 6) return count;
  if (count >= DEFAULT_PAYMENTS_PER_YEAR) return count;
  return DEFAULT_PAYMENTS_PER_YEAR;
}

/** Cash dividend per share for one ex-div / pay event (declared trailing DPS ÷ frequency). */
export function perEventDividendPerShare(input: {
  symbol: string;
  quantity: number | string;
  annualPerShare: number | null;
  annualIncome: number;
  payments?: PortfolioDividendPayment[];
}): number | null {
  const qty = Number(input.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return null;

  if (input.annualPerShare != null && input.annualPerShare > 0) {
    const paymentsPerYear = input.payments
      ? inferPaymentsPerYearFromHistory(input.payments, input.symbol, {
          quantity: qty,
          annualIncome: input.annualIncome,
          annualPerShare: input.annualPerShare,
        })
      : DEFAULT_PAYMENTS_PER_YEAR;
    const dps = input.annualPerShare / paymentsPerYear;
    if (Number.isFinite(dps) && dps > 0) return dps;
  }

  const fallback = input.annualIncome / qty / DEFAULT_PAYMENTS_PER_YEAR;
  return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
}

/** Estimated and confirmed cash dividend for one ex-div / pay-date event from a single holding. */
export function estimateSymbolEventDividendEstimates(input: {
  symbol: string;
  quantity: string | number;
  currency: string;
  quote: PortfolioQuoteRow | null | undefined;
  fx: PortfolioFxRates;
  payments?: PortfolioDividendPayment[];
}): SymbolEventDividendEstimates | null {
  const qty = Number(input.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return null;

  const annual = estimateHoldingAnnualDividend(
    { quantity: input.quantity, currency: input.currency },
    input.quote,
    input.fx,
  );
  if (!annual) return null;

  const perShare = perEventDividendPerShare({
    symbol: input.symbol,
    quantity: qty,
    annualPerShare: annual.dividendPerShare,
    annualIncome: annual.estAnnualIncome,
    payments: input.payments,
  });
  if (perShare == null) return null;

  const estimateAmount = perShare * qty;
  if (!Number.isFinite(estimateAmount) || estimateAmount <= 0) return null;

  const lastPerShare =
    input.payments != null
      ? latestPerShareCashDividendFromPayments(input.payments, input.symbol, qty)
      : null;
  const confirmed =
    lastPerShare != null && Number.isFinite(lastPerShare) && lastPerShare > 0
      ? { amount: lastPerShare * qty, currency: annual.currency }
      : null;

  return {
    estimate: { amount: estimateAmount, currency: annual.currency },
    confirmed,
  };
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
  return estimateSymbolEventDividendEstimates(input)?.estimate ?? null;
}

function convertEstimateToDisplay(
  estimate: EventDividendEstimate,
  displayCurrency: string,
  fx: PortfolioFxRates,
): EventDividendEstimate | null {
  const target = normalizePortfolioCurrency(displayCurrency);
  const converted = convertPortfolioMoney(estimate.amount, estimate.currency, target, fx);
  if (converted == null) return null;
  return { amount: converted, currency: target };
}

function accumulateSymbolEventDividendEstimates(
  map: Map<string, SymbolEventDividendEstimates>,
  symbol: string,
  row: SymbolEventDividendEstimates,
  displayCurrency: string,
  fx: PortfolioFxRates,
): void {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return;

  const estimate = convertEstimateToDisplay(row.estimate, displayCurrency, fx);
  if (!estimate) return;
  const confirmed = row.confirmed
    ? convertEstimateToDisplay(row.confirmed, displayCurrency, fx)
    : null;

  const existing = map.get(sym);
  if (existing) {
    const mergedEstimate: EventDividendEstimate = {
      amount: existing.estimate.amount + estimate.amount,
      currency: estimate.currency,
    };

    let mergedConfirmed: EventDividendEstimate | null = null;
    if (existing.confirmed && confirmed) {
      mergedConfirmed = {
        amount: existing.confirmed.amount + confirmed.amount,
        currency: confirmed.currency,
      };
    } else if (confirmed) {
      mergedConfirmed = confirmed;
    } else if (existing.confirmed) {
      mergedConfirmed = existing.confirmed;
    }

    map.set(sym, { estimate: mergedEstimate, confirmed: mergedConfirmed });
  } else {
    map.set(sym, { estimate, confirmed });
  }
}

/** Build per-symbol event dividend estimates for portfolio holdings only (display currency). */
export function buildEventDividendEstimatesBySymbol(input: {
  holdings: EventDividendHoldingInput[];
  quotes: Record<string, PortfolioQuoteRow | null>;
  fx: PortfolioFxRates;
  payments?: PortfolioDividendPayment[];
  displayCurrency: string;
}): Map<string, SymbolEventDividendEstimates> {
  const canonicalEstimates = new Map<string, SymbolEventDividendEstimates>();
  const aliasToCanonical = new Map<string, string>();

  for (const h of input.holdings) {
    const sym = h.symbolYahoo.trim().toUpperCase();
    if (!sym) continue;

    const quote = lookupPortfolioQuote(input.quotes, h.symbolYahoo);
    const canonical = resolveCanonicalSymbol(h.symbolYahoo, quote, aliasToCanonical, canonicalEstimates);

    const estimates = estimateSymbolEventDividendEstimates({
      symbol: sym,
      quantity: h.quantity,
      currency: h.currency,
      quote,
      fx: input.fx,
      payments: input.payments,
    });
    if (!estimates) continue;

    accumulateSymbolEventDividendEstimates(
      canonicalEstimates,
      canonical,
      estimates,
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
