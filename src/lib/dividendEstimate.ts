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
  const bySymbol = new Map<string, EventDividendEstimate>();

  for (const h of input.holdings) {
    const sym = h.symbolYahoo.trim().toUpperCase();
    if (!sym) continue;

    const estimate = estimateEventDividendPayment({
      symbol: sym,
      quantity: h.quantity,
      currency: h.currency,
      quote: input.quotes[h.symbolYahoo],
      fx: input.fx,
      payments: input.payments,
    });
    if (!estimate) continue;

    accumulateEventDividendEstimate(bySymbol, sym, estimate, input.displayCurrency, input.fx);

    const resolved = input.quotes[h.symbolYahoo]?.resolvedYahooSymbol?.trim().toUpperCase();
    if (resolved && resolved !== sym) {
      const entry = bySymbol.get(sym);
      if (entry) bySymbol.set(resolved, entry);
    }
  }

  return bySymbol;
}
