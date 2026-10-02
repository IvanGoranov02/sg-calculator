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
  resolvedYahooSymbol?: string | null;
};

/**
 * Upcoming per-share estimates are gross Yahoo cash. A Bulgarian resident
 * individual is shown the amount after tax:
 *
 * - US-source dividends (Nasdaq, or a mapped EU listing of a US issuer such as
 *   MSF.DE): 10% US withholding under the Bulgaria–US income tax treaty,
 *   Article 10(2)(b). Trading 212 withholds this rate for Bulgarian residents.
 *   The 5% Bulgarian final dividend tax (ЗДДФЛ чл. 38, ал. 1, charged on the
 *   gross under чл. 46, ал. 3) is wiped out by the foreign tax credit once US
 *   withholding is already 10%, so the cash factor is 0.90 only.
 * - Other issuers: only that 5% Bulgarian tax. No US withholding is invented
 *   for local European names.
 *
 * Recorded portfolio payments are cash already received, so they are not taxed
 * again. At 0.85 EUR per USD: 0.98 USD × 0.708416 shares × 0.90 × 0.85 ≈ €0.53.
 */
export const US_DIVIDEND_WITHHOLDING_RATE = 0.1;
export const BG_DIVIDEND_TAX_RATE = 0.05;

const PAYMENTS_PER_YEAR = [1, 2, 4, 12] as const;
/**
 * Per-share cash within this relative gap of annual/frequency is already in the
 * listing currency. Wider than that, a US issuer's cash is still USD.
 */
const LISTING_CURRENCY_MATCH_GAP = 0.08;
/** Plausible quote-currency units per 1 USD (EUR, GBP, CHF). */
const IMPLIED_FX_MIN = 0.5;
const IMPLIED_FX_MAX = 1.25;

export function upcomingDividendNetFactor(symbol: string): number {
  if (isUsSourceDividendSymbol(symbol)) return 1 - US_DIVIDEND_WITHHOLDING_RATE;
  return 1 - BG_DIVIDEND_TAX_RATE;
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

const DAY_MS = 86_400_000;
/** How far a year-ago ex-date may sit from the same slot and still be a match. */
const SEASONAL_SLOT_DAYS = 45;
/** Year-over-year gap that still looks like the same dividend slot. */
const YOY_SHIFT_MIN_DAYS = 300;
const YOY_SHIFT_MAX_DAYS = 430;
/** Ignore a last payment older than this; the series is too stale to project. */
const STALE_DIVIDEND_DAYS = 450;
/** Do not invent a date more than this far ahead. */
const MAX_PROJECTED_DAYS = 400;
/** Annual DPS vs last cash must sit this close to 1/2/4/12 to infer a cadence. */
const FREQUENCY_MATCH_GAP = 0.2;

function parseIsoUtc(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Date.UTC(year, month - 1, day);
}

function formatIsoUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addCalendarYears(ms: number, years: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate());
}

function normalizeExDates(dates: string[]): string[] {
  const unique = new Set<string>();
  for (const raw of dates) {
    const iso = isoDay(raw);
    if (iso) unique.add(iso);
  }
  return [...unique].sort();
}

function quoteStillPaysDividends(quote: UpcomingDividendQuote): boolean {
  return (
    (quote.dividendYield != null && quote.dividendYield > 0) ||
    (quote.dividendRate != null && quote.dividendRate > 0)
  );
}

/**
 * Yahoo's calendar ex-date is the next one for most US listings, but for a
 * European issuer it usually stays on the previous payment until the next
 * ex-date is very close. Project the next slot from ex-date history instead.
 *
 * The next date is the dividend that followed last year's counterpart of the
 * latest payment, shifted by that year-over-year gap. Annual names fall back
 * to the same calendar day next year. A regular gap is the last resort.
 */
export function projectNextExDividendDate(dates: string[], today: string): string | null {
  const unique = normalizeExDates(dates);
  if (unique.length === 0) return null;
  const todayMs = parseIsoUtc(today);
  if (todayMs == null) return null;

  const upcoming = unique.find((d) => d >= today);
  if (upcoming) return upcoming;

  if (unique.length < 2) return null;
  const last = unique[unique.length - 1]!;
  const lastMs = parseIsoUtc(last);
  if (lastMs == null || lastMs < todayMs - STALE_DIVIDEND_DAYS * DAY_MS) return null;

  return projectSeasonalExDate(unique, lastMs, todayMs) ?? projectExDateByMedianGap(unique, lastMs, todayMs);
}

function projectSeasonalExDate(dates: string[], lastMs: number, todayMs: number): string | null {
  const last = formatIsoUtc(lastMs);
  let counterpartMs: number | null = null;
  let bestDelta = Infinity;
  for (const d of dates) {
    if (d === last) continue;
    const ms = parseIsoUtc(d);
    if (ms == null) continue;
    const delta = Math.abs(ms - (lastMs - 365 * DAY_MS));
    if (delta <= SEASONAL_SLOT_DAYS * DAY_MS && delta < bestDelta) {
      bestDelta = delta;
      counterpartMs = ms;
    }
  }
  if (counterpartMs == null) return null;
  const shift = lastMs - counterpartMs;
  const shiftDays = shift / DAY_MS;
  if (shiftDays < YOY_SHIFT_MIN_DAYS || shiftDays > YOY_SHIFT_MAX_DAYS) return null;

  const candidates: number[] = [];
  for (const d of dates) {
    const ms = parseIsoUtc(d);
    if (ms == null || ms <= counterpartMs || ms >= lastMs) continue;
    const shifted = ms + shift;
    if (shifted > lastMs) candidates.push(shifted);
  }
  candidates.push(addCalendarYears(lastMs, 1));
  candidates.sort((a, b) => a - b);

  for (let extraYears = 0; extraYears < 2; extraYears++) {
    for (const ms of candidates) {
      const bumped = extraYears === 0 ? ms : addCalendarYears(ms, extraYears);
      if (bumped >= todayMs && bumped <= todayMs + MAX_PROJECTED_DAYS * DAY_MS) {
        return formatIsoUtc(bumped);
      }
    }
  }
  return null;
}

function projectExDateByMedianGap(dates: string[], lastMs: number, todayMs: number): string | null {
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const prev = parseIsoUtc(dates[i - 1]!);
    const curr = parseIsoUtc(dates[i]!);
    if (prev == null || curr == null) continue;
    const gap = Math.round((curr - prev) / DAY_MS);
    if (gap >= 25 && gap <= 420) gaps.push(gap);
  }
  if (gaps.length === 0) return null;
  const recent = gaps.slice(-8).sort((a, b) => a - b);
  const median = recent[Math.floor((recent.length - 1) / 2)]!;
  return stepExDate(lastMs, median, todayMs);
}

function inferDividendIntervalDays(perShare: number, annual: number): number | null {
  const { gap, expected } = listingDividendMatch(perShare, annual);
  if (!Number.isFinite(gap) || gap > FREQUENCY_MATCH_GAP || !(expected > 0)) return null;
  const freq = Math.round(annual / expected);
  if (freq !== 1 && freq !== 2 && freq !== 4 && freq !== 12) return null;
  return Math.round(365 / freq);
}

/** When ex-date history is missing, step the last ex-date by 1/2/4/12. */
function projectExDividendFromCadence(quote: UpcomingDividendQuote, today: string): string | null {
  const todayMs = parseIsoUtc(today);
  if (todayMs == null) return null;
  const anchor = isoDay(quote.exDividendDate) ?? isoDay(quote.lastDividendDate);
  if (!anchor || anchor >= today) return null;
  const anchorMs = parseIsoUtc(anchor);
  if (anchorMs == null || anchorMs < todayMs - STALE_DIVIDEND_DAYS * DAY_MS) return null;
  const perShare = quote.lastDividendPerShare;
  const annual = quoteAnnualDividend(quote);
  if (perShare == null || !(perShare > 0) || annual == null) return null;
  const interval = inferDividendIntervalDays(perShare, annual);
  if (interval == null) return null;
  return stepExDate(anchorMs, interval, todayMs);
}

function stepExDate(lastMs: number, gapDays: number, todayMs: number): string | null {
  if (gapDays < 25 || gapDays > 420) return null;
  let next = lastMs + gapDays * DAY_MS;
  let steps = 0;
  while (next < todayMs && steps < 8) {
    next += gapDays * DAY_MS;
    steps += 1;
  }
  if (next < todayMs || next > todayMs + MAX_PROJECTED_DAYS * DAY_MS) return null;
  return formatIsoUtc(next);
}

function lookupExDividendHistory(
  history: Record<string, string[]> | undefined,
  keys: Array<string | null | undefined>,
): string[] {
  if (!history) return [];
  for (const key of keys) {
    if (!key) continue;
    const hit = history[key] ?? history[key.toUpperCase()];
    if (hit && hit.length > 0) return hit;
  }
  return [];
}

/**
 * Keep a Yahoo ex/pay date that is still ahead. Otherwise fill the next
 * ex-date from chart history, then from the annual-vs-last-cash cadence.
 * `lastDividendDate` stays the previous payment, so the cash stays estimated.
 */
export function quoteWithProjectedExDividend<T extends UpcomingDividendQuote>(
  quote: T,
  historyExDates: string[],
  today: string,
): T {
  if (upcomingDividendDate(quote, today)) return quote;
  if (!quoteStillPaysDividends(quote)) return quote;
  const dates = normalizeExDates([
    ...historyExDates,
    quote.exDividendDate ?? "",
    quote.lastDividendDate ?? "",
  ]);
  const projected =
    (dates.length >= 2 ? projectNextExDividendDate(dates, today) : null) ??
    projectExDividendFromCadence(quote, today);
  if (!projected) return quote;
  return { ...quote, exDividendDate: projected };
}

/** Yahoo symbols whose calendar date is already in the past but that still pay. */
export function symbolsNeedingExDividendHistory(
  quotes: Record<string, UpcomingDividendQuote | null | undefined>,
  today: string,
): string[] {
  const out: string[] = [];
  for (const [key, quote] of Object.entries(quotes)) {
    if (!quote || upcomingDividendDate(quote, today) || !quoteStillPaysDividends(quote)) continue;
    const sym = (quote.resolvedYahooSymbol || key).trim().toUpperCase();
    if (sym && !out.includes(sym)) out.push(sym);
  }
  return out;
}

/** Ex-dates from a Yahoo chart `events.dividends` payload (array or timestamp map). */
export function exDividendDatesFromYahooChart(chartResult: unknown): string[] {
  if (!chartResult || typeof chartResult !== "object") return [];
  const ev = (chartResult as { events?: { dividends?: unknown } }).events?.dividends;
  if (ev == null) return [];
  const raw = Array.isArray(ev) ? ev : Object.values(ev as Record<string, unknown>);
  const dates: string[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as { date?: unknown; amount?: unknown };
    const amount = typeof row.amount === "number" ? row.amount : Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const iso = chartEventIsoDate(row.date);
    if (iso) dates.push(iso);
  }
  return normalizeExDates(dates);
}

function chartEventIsoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return isoDay(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
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

/** Closest annual/frequency payment, and how far `perShare` sits from it. */
function listingDividendMatch(perShare: number, annual: number): { gap: number; expected: number } {
  let gap = Infinity;
  let expected = 0;
  if (!(perShare > 0) || !(annual > 0)) return { gap, expected };
  for (const freq of PAYMENTS_PER_YEAR) {
    const payment = annual / freq;
    const rel = Math.abs(perShare - payment) / payment;
    if (rel < gap) {
      gap = rel;
      expected = payment;
    }
  }
  return { gap, expected };
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
 * On a mapped EU listing of a US issuer the quote is EUR/GBP but
 * `lastDividendValue` is often still the USD amount (MSF.DE 0.98 vs a ~€3.40
 * annual rate). If that cash already matches the listing-currency annual
 * dividend, keep the listing currency — including when yield and dividendRate
 * are both missing, so an EUR figure is not converted again. A wide gap means
 * the cash is still USD; the portfolio FX rate is not used to make that call,
 * because a rate of 1 or 0.70 would otherwise lose to the unconverted reading.
 */
export function resolveUpcomingDividendCurrency(
  symbol: string,
  perShare: number,
  quote: UpcomingDividendQuote,
  _fx: PortfolioFxRates,
): string {
  const quoteCcy = normalizePortfolioCurrency(quote.currency);
  if (!isUsSourceDividendSymbol(symbol) || quoteCcy === "USD" || !(perShare > 0)) return quoteCcy;

  const annual = quoteAnnualDividend(quote);
  if (annual == null) return quoteCcy;

  const { gap, expected } = listingDividendMatch(perShare, annual);
  if (gap <= LISTING_CURRENCY_MATCH_GAP) return quoteCcy;

  const impliedQuotePerUsd = expected / perShare;
  if (impliedQuotePerUsd < IMPLIED_FX_MIN || impliedQuotePerUsd > IMPLIED_FX_MAX) return quoteCcy;
  return "USD";
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
  /** Past ex-dates keyed by portfolio symbol or resolved Yahoo symbol. */
  exDividendHistory?: Record<string, string[]>;
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
    const rawQuote = input.quotes[pos.symbol] ?? input.quotes[key];
    if (!rawQuote) continue;
    const history = lookupExDividendHistory(input.exDividendHistory, [
      pos.symbol,
      key,
      rawQuote.resolvedYahooSymbol,
    ]);
    const quote = quoteWithProjectedExDividend(rawQuote, history, today);
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
  /** Past ex-dates for listings whose Yahoo calendar date has already passed. */
  exDividendHistory?: Record<string, string[]>;
  today?: string;
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
    exDividendHistory: input.exDividendHistory,
    today: input.today,
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
