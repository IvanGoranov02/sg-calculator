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
const CLEAN_PAYMENT_FREQUENCIES = new Set([1, 2, 4, 12]);

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

function findLatestPayment(
  payments: PortfolioDividendPayment[],
  symbol: string,
  asOfMs = Date.now(),
): PortfolioDividendPayment | null {
  let latest: { t: number; payment: PortfolioDividendPayment } | null = null;
  for (const p of payments) {
    if (!paymentMatchesSymbol(p, symbol) || p.amount <= 0 || !Number.isFinite(p.amount)) continue;
    const t = new Date(`${p.paidOn}T12:00:00Z`).getTime();
    if (!Number.isFinite(t) || t > asOfMs) continue;
    if (!latest || t > latest.t) latest = { t, payment: p };
  }
  return latest?.payment ?? null;
}

/**
 * Last cash dividend per share implied by a payment and declared per-event DPS.
 * Uses payment amount ÷ (payment ÷ DPS) so position size changes do not distort DPS.
 */
export function lastCashDpsPerShareFromPayment(
  payment: PortfolioDividendPayment,
  perEventDps: number,
): number | null {
  if (!Number.isFinite(perEventDps) || perEventDps <= 0) return null;
  const impliedSharesAtPayment = payment.amount / perEventDps;
  if (!Number.isFinite(impliedSharesAtPayment) || impliedSharesAtPayment <= 0) return null;
  const dps = payment.amount / impliedSharesAtPayment;
  return Number.isFinite(dps) && dps > 0 ? dps : null;
}

/** Most recent portfolio dividend payment, as cash per share at current quantity. */
export function latestPerShareCashDividendFromPayments(
  payments: PortfolioDividendPayment[],
  symbol: string,
  quantity: number | string,
  perEventDps?: number | null,
  asOfMs = Date.now(),
): number | null {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) return null;

  const latest = findLatestPayment(payments, symbol, asOfMs);
  if (!latest) return null;

  if (perEventDps != null && perEventDps > 0) {
    return lastCashDpsPerShareFromPayment(latest, perEventDps);
  }

  const perShare = latest.amount / qty;
  return Number.isFinite(perShare) && perShare > 0 ? perShare : null;
}

export type InferPaymentsPerYearOptions = {
  asOfMs?: number;
  quantity?: number | string;
  /** Holding annual dividend cash (trailing rate × shares). */
  annualIncome?: number | null;
  /** Trailing annual dividend per share from the quote. */
  annualPerShare?: number | null;
  /** Declared per-event DPS (optional; improves last-cash DPS when shares changed). */
  perEventDps?: number | null;
};

function inferLastCashDpsPerShareForFrequency(
  payment: PortfolioDividendPayment,
  annualPerShare: number,
  referenceQty: number,
): number | null {
  if (!Number.isFinite(referenceQty) || referenceQty <= 0) return null;
  let bestDps: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const freq of CLEAN_PAYMENT_FREQUENCIES) {
    const dps = annualPerShare / freq;
    if (dps <= 0) continue;
    const impliedQty = payment.amount / dps;
    const score = Math.abs(impliedQty - referenceQty) / referenceQty;
    if (score < bestScore) {
      bestScore = score;
      bestDps = dps;
    }
  }
  if (bestDps != null && bestScore <= 0.25) return bestDps;
  const fallback = payment.amount / referenceQty;
  return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
}

function frequencyFromAnnualAndLastCashDps(
  annualPerShare: number,
  lastCashDpsPerShare: number,
): number | null {
  const implied = annualPerShare / lastCashDpsPerShare;
  const rounded = Math.round(implied);
  if (!CLEAN_PAYMENT_FREQUENCIES.has(rounded) || Math.abs(implied - rounded) > 0.35) {
    return null;
  }
  const expectedPerEvent = annualPerShare / rounded;
  const relDiff = Math.abs(lastCashDpsPerShare - expectedPerEvent) / expectedPerEvent;
  if (relDiff > 0.15) return null;
  return rounded;
}

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
    const latest = findLatestPayment(payments, symbol, asOfMs);
    const lastPerShare =
      latest != null
        ? inferLastCashDpsPerShareForFrequency(latest, annualPerShare, qty)
        : latestPerShareCashDividendFromPayments(
            payments,
            symbol,
            qty,
            options.perEventDps,
            asOfMs,
          );
    if (lastPerShare != null && lastPerShare > 0) {
      const fromRatio = frequencyFromAnnualAndLastCashDps(annualPerShare, lastPerShare);
      if (fromRatio != null) return fromRatio;
      if (count <= 2) return DEFAULT_PAYMENTS_PER_YEAR;
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
    let paymentsPerYear = DEFAULT_PAYMENTS_PER_YEAR;
    if (input.payments) {
      paymentsPerYear = inferPaymentsPerYearFromHistory(input.payments, input.symbol, {
        quantity: qty,
        annualIncome: input.annualIncome,
        annualPerShare: input.annualPerShare,
      });
    }
    const perEventDps = input.annualPerShare / paymentsPerYear;
    if (Number.isFinite(perEventDps) && perEventDps > 0) return perEventDps;
  }

  const fallback = input.annualIncome / qty / DEFAULT_PAYMENTS_PER_YEAR;
  return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
}

/**
 * Pay-date confirmed total: scale the latest portfolio payment to current total shares.
 * Currency is the payment's currency (not the holding currency).
 */
export function confirmedEventDividendForSymbol(input: {
  symbol: string;
  totalQuantity: number;
  perEventDps: number | null;
  payments?: PortfolioDividendPayment[];
  asOfMs?: number;
}): EventDividendEstimate | null {
  const qty = input.totalQuantity;
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (input.perEventDps == null || !Number.isFinite(input.perEventDps) || input.perEventDps <= 0) {
    return null;
  }
  if (!input.payments?.length) return null;

  const latest = findLatestPayment(input.payments, input.symbol, input.asOfMs);
  if (!latest) return null;

  const impliedSharesAtPayment = latest.amount / input.perEventDps;
  if (!Number.isFinite(impliedSharesAtPayment) || impliedSharesAtPayment <= 0) return null;

  const scaled = latest.amount * (qty / impliedSharesAtPayment);
  if (!Number.isFinite(scaled) || scaled <= 0) return null;

  return {
    amount: scaled,
    currency: normalizePortfolioCurrency(latest.currency),
  };
}

/** Estimated cash dividend for one ex-div / pay-date event from a single holding. */
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

  return {
    estimate: { amount: estimateAmount, currency: annual.currency },
    confirmed: null,
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

function accumulateEventDividendEstimate(
  map: Map<string, SymbolEventDividendEstimates>,
  symbol: string,
  estimate: EventDividendEstimate,
  displayCurrency: string,
  fx: PortfolioFxRates,
): void {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return;

  const converted = convertEstimateToDisplay(estimate, displayCurrency, fx);
  if (!converted) return;

  const existing = map.get(sym);
  if (existing) {
    map.set(sym, {
      estimate: {
        amount: existing.estimate.amount + converted.amount,
        currency: converted.currency,
      },
      confirmed: existing.confirmed,
    });
  } else {
    map.set(sym, { estimate: converted, confirmed: null });
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
  const canonicalTotalQty = new Map<string, number>();
  const canonicalPerEventDps = new Map<string, number>();
  const canonicalSymbolForConfirmed = new Map<string, string>();
  const canonicalAnnualPerShare = new Map<string, number>();

  for (const h of input.holdings) {
    const sym = h.symbolYahoo.trim().toUpperCase();
    if (!sym) continue;

    const quote = lookupPortfolioQuote(input.quotes, h.symbolYahoo);
    const canonical = resolveCanonicalSymbol(h.symbolYahoo, quote, aliasToCanonical, canonicalEstimates);

    const qty = Number(h.quantity);
    if (Number.isFinite(qty) && qty > 0) {
      canonicalTotalQty.set(canonical, (canonicalTotalQty.get(canonical) ?? 0) + qty);
    }
    canonicalSymbolForConfirmed.set(canonical, sym);
    const annual = estimateHoldingAnnualDividend(
      { quantity: h.quantity, currency: h.currency },
      quote,
      input.fx,
    );
    if (annual?.dividendPerShare != null && !canonicalAnnualPerShare.has(canonical)) {
      canonicalAnnualPerShare.set(canonical, annual.dividendPerShare);
    }

    const estimates = estimateSymbolEventDividendEstimates({
      symbol: sym,
      quantity: h.quantity,
      currency: h.currency,
      quote,
      fx: input.fx,
      payments: input.payments,
    });
    if (!estimates) continue;

    accumulateEventDividendEstimate(
      canonicalEstimates,
      canonical,
      estimates.estimate,
      input.displayCurrency,
      input.fx,
    );
  }

  for (const [canonical, totalQty] of canonicalTotalQty) {
    const annualPerShare = canonicalAnnualPerShare.get(canonical);
    const paymentSymbol = canonicalSymbolForConfirmed.get(canonical) ?? canonical;
    if (annualPerShare != null && totalQty > 0) {
      const perEvent = perEventDividendPerShare({
        symbol: paymentSymbol,
        quantity: totalQty,
        annualPerShare,
        annualIncome: annualPerShare * totalQty,
        payments: input.payments,
      });
      if (perEvent != null) canonicalPerEventDps.set(canonical, perEvent);
    }
  }

  for (const [canonical, totalQty] of canonicalTotalQty) {
    const entry = canonicalEstimates.get(canonical);
    if (!entry) continue;
    const perEventDps = canonicalPerEventDps.get(canonical) ?? null;
    const paymentSymbol = canonicalSymbolForConfirmed.get(canonical) ?? canonical;
    const confirmed = confirmedEventDividendForSymbol({
      symbol: paymentSymbol,
      totalQuantity: totalQty,
      perEventDps,
      payments: input.payments,
    });
    if (!confirmed) continue;
    const converted = convertEstimateToDisplay(confirmed, input.displayCurrency, input.fx);
    if (converted) entry.confirmed = converted;
  }

  const bySymbol = new Map(canonicalEstimates);
  for (const [alias, canonical] of aliasToCanonical) {
    if (alias === canonical) continue;
    const entry = canonicalEstimates.get(canonical);
    if (entry) bySymbol.set(alias, entry);
  }

  return bySymbol;
}
