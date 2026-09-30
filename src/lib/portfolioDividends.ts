import type { PortfolioHolding } from "@prisma/client";

import { payloadToEditableBundle } from "@/lib/adminCacheApi";
import { computeTtmDpsGrowthPills, rollingSum4Quarterly } from "@/lib/dividendMetrics";
import { normalizeIsoDateString } from "@/lib/format";
import { computeGrowthPills, type GrowthPills } from "@/lib/growthPills";
import { convertPortfolioMoney, normalizePortfolioCurrency, type PortfolioFxRates } from "@/lib/portfolioFx";
import type { PortfolioQuoteRow } from "@/lib/portfolioMarketData";
import { mapT212DividendItem, sortT212DividendsRecent } from "@/lib/t212Dividends";
import { isUsSourceDividendSymbol, t212TickerToYahooCandidates } from "@/lib/t212Ticker";
import type { T212HistoryDividendItem } from "@/lib/trading212Client";
import { sortQuarterlyByDateAsc } from "@/lib/stockAnalysisTypes";

export type PortfolioDividendPayment = {
  id: string;
  source: "t212" | "manual";
  ticker: string;
  symbolYahoo: string | null;
  name: string | null;
  amount: number;
  currency: string;
  paidOn: string;
  note?: string | null;
};

export type PortfolioDividendPosition = {
  symbol: string;
  name: string | null;
  quantity: number;
  avgPrice: number;
  currency: string;
  price: number | null;
  dividendYield: number | null;
  dividendPerShare: number | null;
  yieldOnCost: number | null;
  estAnnualIncome: number | null;
  growthPills: GrowthPills | null;
};

export type PortfolioDividendMonth = {
  month: string;
  totals: { currency: string; amount: number }[];
};

export type PortfolioDividendChartPoint = {
  month: string;
  income: number | null;
};

export type HoldingDividendMonthRow = {
  month: string;
  amount: number | null;
  currency: string;
};

/** How many upcoming dividends the portfolio dividends card shows, left to right. */
export const UPCOMING_DIVIDENDS_LIMIT = 5;

export type UpcomingPortfolioDividend = {
  symbol: string;
  name: string | null;
  /** Pay date when Yahoo has one, otherwise the ex-dividend date. ISO yyyy-mm-dd. */
  date: string;
  /** After-tax cash in `currency` (holding currency when FX allows). */
  amount: number;
  currency: string;
  /** True when the next cash amount is not published and the previous dividend is shown. */
  estimated: boolean;
};

export type PortfolioDividendsPayload = {
  positions: PortfolioDividendPosition[];
  payments: PortfolioDividendPayment[];
  upcomingDividends: UpcomingPortfolioDividend[];
  monthlyIncome: PortfolioDividendMonth[];
  chartSeries: PortfolioDividendChartPoint[];
  fx: PortfolioFxRates;
  summary: {
    portfolioYieldOnValue: number | null;
    portfolioYieldOnCost: number | null;
    incomeGrowthPills: GrowthPills | null;
    baseCurrency: string;
  };
  trading212: { connected: boolean; error?: string; cachedAt?: string | null; partial?: boolean };
};

type HoldingRow = Pick<
  PortfolioHolding,
  "symbolYahoo" | "symbolT212" | "quantity" | "avgPrice" | "currency"
>;

type ManualDividendRow = {
  id: string;
  symbolYahoo: string | null;
  ticker: string;
  amount: { toString(): string };
  currency: string;
  paidOn: Date;
  note: string | null;
};

type HoldingDividendMetrics = {
  symbol: string;
  name: string | null;
  quantity: number;
  avgPrice: number;
  currency: string;
  price: number | null;
  cost: number;
  mv: number | null;
  dividendYield: number | null;
  dividendPerShare: number | null;
  yieldOnCost: number | null;
  estAnnualIncome: number | null;
  isPayer: boolean;
  resolvedSymbol: string;
};

function monthKey(isoDate: string): string | null {
  const normalized = normalizeIsoDateString(isoDate);
  return normalized ? normalized.slice(0, 7) : null;
}

/** Bulgaria euro adoption: dividend payouts from 2026-01 are labeled EUR in the UI. */
export const BULGARIA_EURO_DIVIDEND_MONTH = "2026-01";

/** Cosmetic display currency for dividend rows; amounts are not converted here. */
export function dividendPaymentDisplayCurrency(paidOn: string, storedCurrency: string): string {
  const ccy = normalizePortfolioCurrency(storedCurrency);
  const mk = monthKey(paidOn);
  if (mk && mk >= BULGARIA_EURO_DIVIDEND_MONTH && ccy === "BGN") return "EUR";
  return ccy;
}

export function paymentMatchesSymbol(p: PortfolioDividendPayment, symbol: string): boolean {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return false;
  if (p.symbolYahoo && p.symbolYahoo.trim().toUpperCase() === sym) return true;
  if (p.ticker.trim().toUpperCase() === sym) return true;
  return false;
}

/** Continuous calendar months for one holding; quiet months have amount null. */
export function buildHoldingMonthlyTimeline(
  payments: PortfolioDividendPayment[],
  symbol: string,
): HoldingDividendMonthRow[] {
  const symPayments = payments.filter(
    (p) => paymentMatchesSymbol(p, symbol) && p.amount > 0 && Number.isFinite(p.amount),
  );
  if (symPayments.length === 0) return [];

  const monthAmounts = new Map<string, number>();
  const monthCurrencies = new Map<string, string>();
  for (const p of symPayments) {
    const key = monthKey(p.paidOn);
    if (!key) continue;
    monthAmounts.set(key, (monthAmounts.get(key) ?? 0) + p.amount);
    monthCurrencies.set(key, dividendPaymentDisplayCurrency(p.paidOn, p.currency));
  }

  const months = [...monthAmounts.keys()].sort();
  if (months.length === 0) return [];

  const calendar = calendarMonthsBetween(months[0]!, months[months.length - 1]!);
  return calendar.map((month) => ({
    month,
    amount: monthAmounts.get(month) ?? null,
    currency: monthCurrencies.get(month) ?? "USD",
  }));
}

type UpcomingDividendQuote = {
  currency?: string | null;
  price?: number | null;
  dividendYield?: number | null;
  dividendRate?: number | null;
  exDividendDate?: string | null;
  dividendPayDate?: string | null;
  lastDividendPerShare?: number | null;
  lastDividendDate?: string | null;
};

/**
 * Upcoming per-share estimates are gross Yahoo cash. A Bulgarian resident
 * individual is shown the amount after tax:
 *
 * - US-source dividends (Nasdaq, or an EU listing of a US issuer such as
 *   MSF.DE): 10% US withholding under the Bulgaria–US income tax treaty,
 *   Article 10(2)(b). Trading 212 withholds this rate for Bulgarian residents.
 *   Then 5% Bulgarian final dividend tax on the remainder (ЗДДФЛ чл. 38, ал. 1).
 * - Other issuers: only that 5% Bulgarian tax. Foreign withholding outside the
 *   US is not modeled.
 *
 * Recorded portfolio payments are cash already received, so they are not taxed
 * again. Worked example at 0.85 EUR per USD: 0.98 USD × 0.708416 shares ×
 * 0.90 × 0.95 × 0.85 ≈ €0.50.
 */
export const US_DIVIDEND_WITHHOLDING_RATE = 0.1;
export const BG_DIVIDEND_TAX_RATE = 0.05;

const PAYMENTS_PER_YEAR = [1, 2, 4, 12] as const;
/** USD interpretation must beat the listing currency by more than this gap. */
const DIVIDEND_CURRENCY_GAP = 0.02;

export function upcomingDividendNetFactor(symbol: string): number {
  const afterBg = 1 - BG_DIVIDEND_TAX_RATE;
  if (isUsSourceDividendSymbol(symbol)) return (1 - US_DIVIDEND_WITHHOLDING_RATE) * afterBg;
  return afterBg;
}

function isoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  return normalizeIsoDateString(value);
}

/** Prefer the pay date; fall back to ex-dividend when that is the only future date. */
function upcomingDividendDate(quote: UpcomingDividendQuote, today: string): string | null {
  const pay = isoDay(quote.dividendPayDate);
  const ex = isoDay(quote.exDividendDate);
  if (pay && pay >= today) return pay;
  if (ex && ex >= today) return ex;
  return null;
}

/**
 * Yahoo publishes the upcoming cash amount once `lastDividendDate` is the
 * announced ex/pay date (or still in the future). An older date means the
 * next amount is not out yet.
 */
function nextDividendAmountKnown(quote: UpcomingDividendQuote, today: string): boolean {
  const declared = isoDay(quote.lastDividendDate);
  const perShare = quote.lastDividendPerShare;
  if (!declared || perShare == null || !(perShare > 0)) return false;
  const ex = isoDay(quote.exDividendDate);
  const pay = isoDay(quote.dividendPayDate);
  if (ex && declared === ex) return true;
  if (pay && declared === pay) return true;
  return declared >= today;
}

function latestPreviousPayment(
  payments: PortfolioDividendPayment[],
  symbol: string,
  today: string,
): PortfolioDividendPayment | null {
  let latest: PortfolioDividendPayment | null = null;
  let latestDay = "";
  for (const p of payments) {
    if (!paymentMatchesSymbol(p, symbol) || !(p.amount > 0) || !Number.isFinite(p.amount)) continue;
    const paidOn = isoDay(p.paidOn);
    if (!paidOn || paidOn > today) continue;
    if (!latest || paidOn > latestDay) {
      latest = p;
      latestDay = paidOn;
    }
  }
  return latest;
}

function bestPaymentGap(amount: number, annual: number): number {
  if (!(amount > 0) || !(annual > 0)) return Infinity;
  let best = Infinity;
  for (const freq of PAYMENTS_PER_YEAR) {
    const expected = annual / freq;
    best = Math.min(best, Math.abs(amount - expected) / expected);
  }
  return best;
}

/** Annual dividend in the listing currency: price × yield, else Yahoo dividendRate. */
function quoteAnnualDividend(quote: UpcomingDividendQuote): number | null {
  const price = quote.price;
  const yieldDec = quote.dividendYield;
  if (price != null && price > 0 && yieldDec != null && yieldDec > 0) {
    const fromYield = price * yieldDec;
    if (Number.isFinite(fromYield) && fromYield > 0) return fromYield;
  }
  const rate = quote.dividendRate;
  if (rate != null && rate > 0 && Number.isFinite(rate)) return rate;
  return null;
}

/**
 * Currency of Yahoo's latest per-share cash.
 * On EU listings of US issuers the quote is EUR/GBP but `lastDividendValue` is
 * often still the USD amount (MSF.DE 0.98 vs a ~€3.40 annual rate). Use USD when
 * that reading, converted, matches the listing-currency annual dividend; keep
 * the listing currency when the cash is already converted.
 */
export function resolveUpcomingDividendCurrency(
  symbol: string,
  perShare: number,
  quote: UpcomingDividendQuote,
  fx: PortfolioFxRates,
): string {
  const quoteCcy = normalizePortfolioCurrency(quote.currency);
  if (!isUsSourceDividendSymbol(symbol) || quoteCcy === "USD" || !(perShare > 0)) return quoteCcy;

  const annual = quoteAnnualDividend(quote);
  if (annual == null) return "USD";

  const asQuote = bestPaymentGap(perShare, annual);
  const inQuote = convertPortfolioMoney(perShare, "USD", quoteCcy, fx);
  if (inQuote == null) return asQuote > 0.08 ? "USD" : quoteCcy;
  const asUsd = bestPaymentGap(inQuote, annual);
  if (asUsd + DIVIDEND_CURRENCY_GAP < asQuote) return "USD";
  return quoteCcy;
}

function cashFromPerShare(
  perShare: number,
  quantity: number,
  dividendCurrency: string,
  holdingCurrency: string,
  fx: PortfolioFxRates,
): { amount: number; currency: string } | null {
  if (!(perShare > 0) || !(quantity > 0)) return null;
  const gross = perShare * quantity;
  if (!Number.isFinite(gross) || gross <= 0) return null;
  const from = normalizePortfolioCurrency(dividendCurrency);
  const to = normalizePortfolioCurrency(holdingCurrency);
  const converted = convertPortfolioMoney(gross, from, to, fx);
  if (converted == null || !(converted > 0)) return { amount: gross, currency: from };
  return { amount: converted, currency: to };
}

/** Gross Yahoo cash × shares, after tax, in the holding currency. */
function upcomingCashFromQuote(
  symbol: string,
  perShare: number,
  quantity: number,
  holdingCurrency: string,
  quote: UpcomingDividendQuote,
  fx: PortfolioFxRates,
): { amount: number; currency: string } | null {
  const dividendCurrency = resolveUpcomingDividendCurrency(symbol, perShare, quote, fx);
  return cashFromPerShare(
    perShare * upcomingDividendNetFactor(symbol),
    quantity,
    dividendCurrency,
    holdingCurrency,
    fx,
  );
}

/** Next portfolio dividends, soonest first, capped for the left-to-right card. */
export function buildUpcomingPortfolioDividends(input: {
  positions: Array<Pick<PortfolioDividendPosition, "symbol" | "name" | "quantity" | "currency">>;
  payments: PortfolioDividendPayment[];
  quotes: Record<string, UpcomingDividendQuote | null | undefined>;
  fx: PortfolioFxRates;
  today?: string;
  limit?: number;
}): UpcomingPortfolioDividend[] {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const limit = input.limit ?? UPCOMING_DIVIDENDS_LIMIT;
  const grouped = new Map<
    string,
    { symbol: string; name: string | null; quantity: number; currency: string }
  >();

  for (const p of input.positions) {
    const symbol = p.symbol.trim();
    const key = symbol.toUpperCase();
    if (!key) continue;
    const qty = Number(p.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { symbol, name: p.name, quantity: qty, currency: p.currency });
    } else {
      existing.quantity += qty;
      if (!existing.name && p.name) existing.name = p.name;
    }
  }

  const out: UpcomingPortfolioDividend[] = [];
  for (const [key, pos] of grouped) {
    const quote = input.quotes[pos.symbol] ?? input.quotes[key];
    if (!quote) continue;
    const date = upcomingDividendDate(quote, today);
    if (!date) continue;

    if (nextDividendAmountKnown(quote, today) && quote.lastDividendPerShare != null) {
      const cash = upcomingCashFromQuote(
        pos.symbol,
        quote.lastDividendPerShare,
        pos.quantity,
        pos.currency,
        quote,
        input.fx,
      );
      if (cash) {
        out.push({
          symbol: pos.symbol,
          name: pos.name,
          date,
          amount: cash.amount,
          currency: cash.currency,
          estimated: false,
        });
        continue;
      }
    }

    const previous = latestPreviousPayment(input.payments, pos.symbol, today);
    if (previous) {
      out.push({
        symbol: pos.symbol,
        name: pos.name,
        date,
        amount: previous.amount,
        currency: normalizePortfolioCurrency(previous.currency),
        estimated: true,
      });
      continue;
    }

    if (quote.lastDividendPerShare != null && quote.lastDividendPerShare > 0) {
      const cash = upcomingCashFromQuote(
        pos.symbol,
        quote.lastDividendPerShare,
        pos.quantity,
        pos.currency,
        quote,
        input.fx,
      );
      if (cash) {
        out.push({
          symbol: pos.symbol,
          name: pos.name,
          date,
          amount: cash.amount,
          currency: cash.currency,
          estimated: true,
        });
      }
    }
  }

  out.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
  return out.slice(0, Math.max(0, limit));
}

/** Inclusive yyyy-mm range with every calendar month. */
export function calendarMonthsBetween(minMonth: string, maxMonth: string): string[] {
  const [y0, m0] = minMonth.split("-").map(Number);
  const [y1, m1] = maxMonth.split("-").map(Number);
  if (!Number.isFinite(y0) || !Number.isFinite(m0) || !Number.isFinite(y1) || !Number.isFinite(m1)) {
    return [];
  }
  const out: string[] = [];
  let y = y0;
  let m = m0;
  while (y < y1 || (y === y1 && m <= m1)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function resolveQuoteName(
  symbolYahoo: string | null,
  ticker: string,
  quotes: Record<string, PortfolioQuoteRow | null>,
  holdings: HoldingRow[],
): string | null {
  const candidates = new Set<string>();
  if (symbolYahoo?.trim()) candidates.add(symbolYahoo.trim().toUpperCase());
  const fromT212 = resolveYahooFromT212Ticker(ticker, holdings);
  if (fromT212?.trim()) candidates.add(fromT212.trim().toUpperCase());
  if (ticker.trim()) candidates.add(ticker.trim().toUpperCase());
  for (const sym of candidates) {
    const name = quotes[sym]?.name?.trim();
    if (name) return name;
  }
  return null;
}

function resolveYahooFromT212Ticker(ticker: string, holdings: HoldingRow[]): string | null {
  const t = ticker.trim();
  if (!t) return null;
  for (const h of holdings) {
    if (h.symbolT212 && h.symbolT212.trim().toUpperCase() === t.toUpperCase()) {
      return h.symbolYahoo;
    }
  }
  const candidates = t212TickerToYahooCandidates(t);
  for (const c of candidates) {
    if (holdings.some((h) => h.symbolYahoo.toUpperCase() === c.toUpperCase())) return c;
  }
  return candidates[0] ?? null;
}

export function growthPillsFromCachePayload(payload: unknown): GrowthPills | null {
  const bundle = payloadToEditableBundle(payload);
  if (!bundle?.dividendQuarterly?.length) return null;
  const sorted = sortQuarterlyByDateAsc(bundle.dividendQuarterly);
  const dpsArr = sorted.map((p) => p.dividendPerShare);
  const ttm = rollingSum4Quarterly(dpsArr);
  const pills = computeTtmDpsGrowthPills(ttm);
  const any =
    pills.oneYear != null ||
    pills.twoYear != null ||
    pills.threeYear != null;
  return any ? pills : null;
}

export function buildMonthlyIncome(payments: PortfolioDividendPayment[]): PortfolioDividendMonth[] {
  const map = new Map<string, Map<string, number>>();
  for (const p of payments) {
    if (p.amount <= 0 || !Number.isFinite(p.amount)) continue;
    const key = monthKey(p.paidOn);
    if (!key) continue;
    const ccy = normalizePortfolioCurrency(p.currency);
    const bucket = map.get(key) ?? new Map<string, number>();
    bucket.set(ccy, (bucket.get(ccy) ?? 0) + p.amount);
    map.set(key, bucket);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, totalsMap]) => ({
      month,
      totals: [...totalsMap.entries()]
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => a.currency.localeCompare(b.currency)),
    }));
}

/** Zero-filled calendar month amounts for one currency (missing months = 0). */
export function buildFilledMonthlyAmounts(
  monthly: PortfolioDividendMonth[],
  currency: string,
): number[] {
  const ccy = normalizePortfolioCurrency(currency);
  const monthsWithCcy = monthly.filter((m) =>
    m.totals.some((t) => normalizePortfolioCurrency(t.currency) === ccy),
  );
  if (monthsWithCcy.length === 0) return [];

  const minMonth = monthsWithCcy[0]!.month;
  const maxMonth = monthsWithCcy[monthsWithCcy.length - 1]!.month;
  const calendar = calendarMonthsBetween(minMonth, maxMonth);
  const map = new Map<string, number>();
  for (const m of monthly) {
    const hit = m.totals.find((t) => normalizePortfolioCurrency(t.currency) === ccy);
    if (hit) map.set(m.month, hit.amount);
  }
  return calendar.map((month) => map.get(month) ?? 0);
}

/** Rolling 12-month paid income on a zero-filled calendar series. */
export function rollingTtmMonthly(amounts: number[]): (number | null)[] {
  return amounts.map((_, i) => {
    if (i < 11) return null;
    let sum = 0;
    for (let j = i - 11; j <= i; j++) sum += amounts[j] ?? 0;
    return sum;
  });
}

function monthIncomeInBaseCurrency(
  m: PortfolioDividendMonth,
  base: string,
  fx: PortfolioFxRates,
): number | null {
  if (m.totals.length === 0) return null;
  let total = 0;
  for (const t of m.totals) {
    const converted = convertPortfolioMoney(t.amount, t.currency, base, fx);
    if (converted == null) return null;
    total += converted;
  }
  return total;
}

/** Zero-filled calendar month amounts in one display currency; null if any paid month cannot convert. */
export function buildFilledMonthlyAmountsInCurrency(
  monthly: PortfolioDividendMonth[],
  targetCurrency: string,
  fx: PortfolioFxRates,
): number[] | null {
  if (monthly.length === 0) return [];

  const base = normalizePortfolioCurrency(targetCurrency);
  const minMonth = monthly[0]!.month;
  const maxMonth = monthly[monthly.length - 1]!.month;
  const calendar = calendarMonthsBetween(minMonth, maxMonth);
  const incomeByMonth = new Map<string, number | null>();
  for (const m of monthly) {
    incomeByMonth.set(m.month, monthIncomeInBaseCurrency(m, base, fx));
  }

  const out: number[] = [];
  for (const month of calendar) {
    const income = incomeByMonth.get(month);
    if (income === undefined) {
      out.push(0);
    } else if (income === null) {
      return null;
    } else {
      out.push(income);
    }
  }
  return out;
}

/** True TTM income growth from calendar months (zeros in quiet months), FX-converted like the chart. */
export function incomeGrowthPillsFromMonthly(
  monthly: PortfolioDividendMonth[],
  currency: string,
  fx: PortfolioFxRates,
): GrowthPills | null {
  const filled = buildFilledMonthlyAmountsInCurrency(monthly, currency, fx);
  if (filled == null || filled.length < 24) return null;
  const ttm = rollingTtmMonthly(filled);
  const pills = computeGrowthPills(ttm, 12);
  const any =
    pills.oneYear != null ||
    pills.twoYear != null ||
    pills.threeYear != null;
  return any ? pills : null;
}

/** Chart series with every calendar month from first to last payment; quiet months have income 0. */
export function buildMonthlyChartSeries(
  monthly: PortfolioDividendMonth[],
  baseCurrency: string,
  fx: PortfolioFxRates,
): PortfolioDividendChartPoint[] {
  if (monthly.length === 0) return [];

  const filled = buildFilledMonthlyAmountsInCurrency(monthly, baseCurrency, fx);
  if (filled == null) {
    const minMonth = monthly[0]!.month;
    const maxMonth = monthly[monthly.length - 1]!.month;
    return calendarMonthsBetween(minMonth, maxMonth).map((month) => ({ month, income: null }));
  }

  const minMonth = monthly[0]!.month;
  const maxMonth = monthly[monthly.length - 1]!.month;
  const calendar = calendarMonthsBetween(minMonth, maxMonth);
  return calendar.map((month, i) => ({
    month,
    income: filled[i] ?? 0,
  }));
}

/** Sum estimated annual dividend income in one display currency (EUR/USD preference). */
export function mergeEstAnnualIncome(
  positions: PortfolioDividendPosition[],
  targetCurrency: string,
  fx: PortfolioFxRates,
): number | null {
  const target = normalizePortfolioCurrency(targetCurrency);
  let total = 0;
  let any = false;
  for (const p of positions) {
    if (p.estAnnualIncome == null || !Number.isFinite(p.estAnnualIncome) || p.estAnnualIncome <= 0) continue;
    any = true;
    const converted = convertPortfolioMoney(p.estAnnualIncome, p.currency, target, fx);
    if (converted == null) return null;
    total += converted;
  }
  return any ? total : null;
}

function pickBaseCurrency(holdings: HoldingRow[]): string {
  const counts = new Map<string, number>();
  for (const h of holdings) {
    counts.set(normalizePortfolioCurrency(h.currency), (counts.get(normalizePortfolioCurrency(h.currency)) ?? 0) + 1);
  }
  let best = "USD";
  let bestN = -1;
  for (const [c, n] of counts) {
    if (n > bestN || (n === bestN && (c === "EUR" || (c === "USD" && best !== "EUR")))) {
      best = c;
      bestN = n;
    }
  }
  return best;
}

export type HoldingAnnualDividendInput = {
  quantity: number | string;
  avgPrice?: number | string;
  currency: string;
};

export type HoldingAnnualDividendEstimate = {
  estAnnualIncome: number;
  currency: string;
  dividendPerShare: number | null;
};

/** Estimated annual dividend income for one holding (same logic as portfolio holdings / dividends views). */
export function estimateHoldingAnnualDividend(
  holding: HoldingAnnualDividendInput,
  quote: PortfolioQuoteRow | null | undefined,
  fx: PortfolioFxRates,
): HoldingAnnualDividendEstimate | null {
  const qQty = Number(holding.quantity);
  if (!Number.isFinite(qQty) || qQty <= 0) return null;
  const holdingCcy = normalizePortfolioCurrency(holding.currency);
  const quoteCcy = quote ? normalizePortfolioCurrency(quote.currency) : holdingCcy;
  const hasValidQuote = quote != null && Number.isFinite(quote.price) && quote.price > 0;
  const priceInHolding =
    hasValidQuote && quote ? convertPortfolioMoney(quote.price, quoteCcy, holdingCcy, fx) : null;
  const mv =
    priceInHolding != null && Number.isFinite(priceInHolding) ? priceInHolding * qQty : null;

  let dividendPerShare: number | null = null;
  let estAnnual: number | null = null;
  if (hasValidQuote && quote) {
    if (quote.dividendRate != null && Number.isFinite(quote.dividendRate)) {
      const rateInHolding = convertPortfolioMoney(quote.dividendRate, quoteCcy, holdingCcy, fx);
      if (rateInHolding != null) {
        dividendPerShare = rateInHolding;
        estAnnual = rateInHolding * qQty;
      }
    }
    if (
      estAnnual == null &&
      quote.dividendYield != null &&
      Number.isFinite(quote.dividendYield) &&
      mv != null &&
      mv > 0
    ) {
      estAnnual = mv * quote.dividendYield;
      if (qQty > 0) dividendPerShare = estAnnual / qQty;
    }
  }

  if (estAnnual == null || !Number.isFinite(estAnnual) || estAnnual <= 0) return null;
  return { estAnnualIncome: estAnnual, currency: holdingCcy, dividendPerShare };
}

function computeHoldingMetrics(
  h: HoldingRow,
  quotes: Record<string, PortfolioQuoteRow | null>,
  fx: PortfolioFxRates,
): HoldingDividendMetrics {
  const q = quotes[h.symbolYahoo];
  const qQty = Number(h.quantity);
  const qAvg = Number(h.avgPrice);
  const holdingCcy = normalizePortfolioCurrency(h.currency);
  const quoteCcy = q ? normalizePortfolioCurrency(q.currency) : holdingCcy;
  const hasValidQuote = q != null && Number.isFinite(q.price) && q.price > 0;
  const priceInHolding =
    hasValidQuote && q ? convertPortfolioMoney(q.price, quoteCcy, holdingCcy, fx) : null;
  const cost = qAvg * qQty;
  const mv = priceInHolding != null && Number.isFinite(priceInHolding) ? priceInHolding * qQty : null;

  const annual = estimateHoldingAnnualDividend(
    { quantity: h.quantity.toString(), avgPrice: h.avgPrice.toString(), currency: h.currency },
    q,
    fx,
  );
  const estAnnual = annual?.estAnnualIncome ?? null;
  const dividendPerShare = annual?.dividendPerShare ?? null;

  const yieldOnCost =
    estAnnual != null && cost > 0 && Number.isFinite(estAnnual) ? (estAnnual / cost) * 100 : null;

  const isPayer =
    (q?.dividendYield != null && q.dividendYield > 0) ||
    (q?.dividendRate != null && q.dividendRate > 0) ||
    (estAnnual != null && estAnnual > 0);

  return {
    symbol: h.symbolYahoo,
    name: q?.name ?? null,
    quantity: qQty,
    avgPrice: qAvg,
    currency: holdingCcy,
    price: priceInHolding,
    cost,
    mv,
    dividendYield: q?.dividendYield ?? null,
    dividendPerShare,
    yieldOnCost,
    estAnnualIncome: estAnnual,
    isPayer,
    resolvedSymbol: q?.resolvedYahooSymbol ?? h.symbolYahoo,
  };
}

export function buildPortfolioDividendsPayload(input: {
  holdings: HoldingRow[];
  quotes: Record<string, PortfolioQuoteRow | null>;
  fx: PortfolioFxRates;
  t212Items: T212HistoryDividendItem[];
  manualRows: ManualDividendRow[];
  cacheBySymbol: Record<string, unknown>;
  trading212: {
    connected: boolean;
    error?: string;
    cachedAt?: string | null;
    partial?: boolean;
  };
}): PortfolioDividendsPayload {
  const metrics = input.holdings.map((h) => computeHoldingMetrics(h, input.quotes, input.fx));
  const baseCurrency = pickBaseCurrency(input.holdings);
  const conv = (v: number | null, from: string) =>
    v == null ? null : convertPortfolioMoney(v, from, baseCurrency, input.fx);

  const positions: PortfolioDividendPosition[] = metrics
    .filter((m) => m.isPayer)
    .map((m) => ({
      symbol: m.symbol,
      name: m.name,
      quantity: m.quantity,
      avgPrice: m.avgPrice,
      currency: m.currency,
      price: m.price,
      dividendYield: m.dividendYield,
      dividendPerShare: m.dividendPerShare,
      yieldOnCost: m.yieldOnCost,
      estAnnualIncome: m.estAnnualIncome,
      growthPills:
        growthPillsFromCachePayload(input.cacheBySymbol[m.resolvedSymbol]) ??
        growthPillsFromCachePayload(input.cacheBySymbol[m.symbol]),
    }))
    .sort((a, b) => (b.estAnnualIncome ?? -1) - (a.estAnnualIncome ?? -1));

  let totalValue = 0;
  let totalCost = 0;
  let totalIncome = 0;
  for (const m of metrics) {
    const mvBase = conv(m.mv, m.currency);
    const costBase = conv(m.cost, m.currency);
    const incomeBase = conv(m.estAnnualIncome ?? 0, m.currency);
    if (mvBase != null) totalValue += mvBase;
    if (costBase != null) totalCost += costBase;
    if (incomeBase != null) totalIncome += incomeBase;
  }

  const t212Payments: PortfolioDividendPayment[] = sortT212DividendsRecent(input.t212Items).map((item, i) => {
    const row = mapT212DividendItem(item);
    const ticker = row.ticker === "—" ? `T212-${i}` : row.ticker;
    const paidOn = normalizeIsoDateString(row.paidOn) ?? "";
    const storedCurrency = row.currency === "—" ? "USD" : row.currency;
    const symbolYahoo = resolveYahooFromT212Ticker(ticker, input.holdings);
    return {
      id: `t212:${ticker}:${row.paidOn ?? i}`,
      source: "t212" as const,
      ticker,
      symbolYahoo,
      name: resolveQuoteName(symbolYahoo, ticker, input.quotes, input.holdings),
      amount: row.amount ?? 0,
      currency: dividendPaymentDisplayCurrency(paidOn, storedCurrency),
      paidOn,
    };
  });

  const manualPayments: PortfolioDividendPayment[] = input.manualRows.map((r) => ({
    id: r.id,
    source: "manual" as const,
    ticker: r.ticker,
    symbolYahoo: r.symbolYahoo,
    name: resolveQuoteName(r.symbolYahoo, r.ticker, input.quotes, input.holdings),
    amount: Number(r.amount),
    currency: normalizePortfolioCurrency(r.currency),
    paidOn: r.paidOn.toISOString().slice(0, 10),
    note: r.note,
  }));

  const payments = [...t212Payments, ...manualPayments]
    .filter((p) => p.paidOn && p.amount > 0)
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn));

  const upcomingDividends = buildUpcomingPortfolioDividends({
    positions: metrics.map((m) => ({
      symbol: m.symbol,
      name: m.name,
      quantity: m.quantity,
      currency: m.currency,
    })),
    payments,
    quotes: input.quotes,
    fx: input.fx,
  });

  const monthlyIncome = buildMonthlyIncome(payments);
  const chartSeries = buildMonthlyChartSeries(monthlyIncome, baseCurrency, input.fx);

  const portfolioYieldOnValue = totalValue > 0 ? (totalIncome / totalValue) * 100 : null;
  const portfolioYieldOnCost = totalCost > 0 ? (totalIncome / totalCost) * 100 : null;
  const incomeGrowthPills = incomeGrowthPillsFromMonthly(monthlyIncome, baseCurrency, input.fx);

  return {
    positions,
    payments,
    upcomingDividends,
    monthlyIncome,
    chartSeries,
    fx: input.fx,
    summary: {
      portfolioYieldOnValue,
      portfolioYieldOnCost,
      incomeGrowthPills,
      baseCurrency,
    },
    trading212: input.trading212,
  };
}
