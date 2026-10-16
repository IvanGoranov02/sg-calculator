/**
 * Server-only: Yahoo Finance for live quote, daily/intraday prices, and (when needed) ex-dividend
 * amounts merged into quarterly dividend-per-share. Fundamentals stay from Gemini/cache.
 */

import {
  applyDividendFx,
  convertBundleFundamentals,
  dividendFxPlan,
  dropStaleOpenWindowSum,
  overlayQuarterlyDividends,
} from "@/lib/bundleCurrency";
import { withTimeout } from "@/lib/asyncTimeout";
import { resolveNextEarningsOrEstimate } from "@/lib/calendarEvents";
import { mapInvestorMetrics } from "@/lib/mapInvestorMetrics";
import { dividendRateToMajorUnits, isPenceQuoteCurrency, quoteCurrencyMajor } from "@/lib/portfolioFx";
import type { HistoricalEodBar, StockAnalysisBundle, StockQuote } from "@/lib/stockAnalysisTypes";
import { yahooFinance } from "@/lib/yahooFinanceClient";

const DAILY_HISTORY_START = "1990-01-01";
export const DAILY_HISTORY_REFRESH_MS = 60 * 60 * 1000;
const PRICE_REQUEST_TIMEOUT_MS = 6_000;

/** Bound the complete Yahoo method (including its queue), then cancel any remaining HTTP work. */
async function priceRequest<T>(
  run: (options: { fetchOptions: { signal: AbortSignal } }) => Promise<T>,
  label: string,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  try {
    const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    return await withTimeout(run({ fetchOptions: { signal: requestSignal } }), PRICE_REQUEST_TIMEOUT_MS, label);
  } finally {
    controller.abort();
  }
}

async function resolveYahooSymbol(input: string, signal?: AbortSignal): Promise<{ symbol: string; quote: Record<string, unknown> }> {
  const trimmed = input.trim();
  const sym = trimmed.toUpperCase();
  if (!sym) throw new Error("Empty ticker.");

  try {
    const quoteResult = await priceRequest((options) => yahooFinance.quote(sym, {}, options), `quote ${sym}`, signal);
    const q = Array.isArray(quoteResult) ? quoteResult[0] : quoteResult;
    if (q && (q as { quoteType?: string }).quoteType !== "NONE") {
      return { symbol: String((q as { symbol?: string }).symbol ?? sym).toUpperCase(), quote: q as unknown as Record<string, unknown> };
    }
  } catch {
    // Quote timed out / failed — fall through to search before failing closed.
  }

  try {
    const searchResult = await priceRequest((options) => yahooFinance.search(trimmed, { quotesCount: 15 }, options), `resolve ${sym}`, signal);
    const hit = searchResult.quotes.find((row) => {
      if (typeof row !== "object" || row === null || !("symbol" in row)) return false;
      const r = row as { symbol?: string; quoteType?: string; isYahooFinance?: boolean };
      return (
        r.isYahooFinance === true &&
        r.quoteType === "EQUITY" &&
        typeof r.symbol === "string"
      );
    }) as { symbol: string } | undefined;

    if (hit?.symbol) {
      const symbol = hit.symbol.toUpperCase();
      const quoteResult = await priceRequest((options) => yahooFinance.quote(symbol, {}, options), `quote ${symbol}`, signal);
      const quote = Array.isArray(quoteResult) ? quoteResult[0] : quoteResult;
      if (quote && (quote as { quoteType?: string }).quoteType !== "NONE") {
        return { symbol, quote: quote as unknown as Record<string, unknown> };
      }
    }
  } catch {
    /* search failed — fail closed below */
  }

  throw new Error(`Yahoo symbol not found: ${sym}`);
}

function toIsoDate(d: unknown): string | null {
  if (d == null || d === "") return null;
  const dt = d instanceof Date ? d : new Date(String(d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

/** Rewrite a quote's earningsDate so it is never in the past (project +91d if needed). */
export function sanitizeQuoteEarningsDate(quote: StockQuote, nowMs: number = Date.now()): void {
  if (!quote.earningsDate) {
    delete quote.earningsDateEstimated;
    return;
  }
  const resolved = resolveNextEarningsOrEstimate([quote.earningsDate], nowMs);
  quote.earningsDate = resolved.date;
  if (resolved.estimated) quote.earningsDateEstimated = true;
  else delete quote.earningsDateEstimated;
}

/** Collect Yahoo quote + calendarEvents candidates; never return a past next-earnings. */
function resolveQuoteEarnings(
  raw: Record<string, unknown>,
  qs: Record<string, unknown> | null,
): { earningsDate: string | null; earningsDateEstimated: boolean } {
  const candidates: Array<Date | string | null> = [];
  const ce = qs?.calendarEvents as { earnings?: { earningsDate?: Array<Date | string> } } | undefined;
  const cal = ce?.earnings?.earningsDate;
  if (Array.isArray(cal)) candidates.push(...cal);
  // Quote timestamps are often the *last* report — include them but never prefer past over future calendar.
  candidates.push(
    toIsoDate(raw.earningsTimestamp),
    toIsoDate(raw.earningsTimestampStart),
    toIsoDate(raw.earningsTimestampEnd),
  );
  const resolved = resolveNextEarningsOrEstimate(candidates);
  return {
    earningsDate: resolved.date,
    earningsDateEstimated: resolved.estimated,
  };
}

function mapQuote(
  resolvedSym: string,
  raw: Record<string, unknown>,
  qs: Record<string, unknown> | null = null,
): StockQuote {
  const q = raw;
  const price = Number(q.regularMarketPrice ?? 0);
  const change = Number(q.regularMarketChange ?? 0);
  let pct = Number(q.regularMarketChangePercent ?? NaN);
  if (!Number.isFinite(pct)) {
    const prev = price - change;
    pct = prev !== 0 ? (change / prev) * 100 : 0;
  }
  const { earningsDate, earningsDateEstimated } = resolveQuoteEarnings(q, qs);

  return {
    symbol: String((q.symbol ?? resolvedSym) as string).toUpperCase(),
    name: String(q.longName ?? q.shortName ?? resolvedSym),
    price,
    change,
    changesPercentage: Number.isFinite(pct) ? pct : 0,
    marketState: typeof q.marketState === "string" ? q.marketState : undefined,
    postMarketPrice: numField(q.postMarketPrice),
    postMarketChange: numField(q.postMarketChange),
    postMarketChangePercent: numField(q.postMarketChangePercent),
    preMarketPrice: numField(q.preMarketPrice),
    preMarketChange: numField(q.preMarketChange),
    preMarketChangePercent: numField(q.preMarketChangePercent),
    earningsDate,
    earningsDateEstimated: earningsDateEstimated || undefined,
  };
}

function numField(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapChartQuotesToBars(
  quotes: Array<{ date: Date; close?: number | null; high?: number | null; low?: number | null; volume?: number | null }>,
): HistoricalEodBar[] {
  return (quotes ?? [])
    .filter((x) => x?.date && x.close != null && Number.isFinite(Number(x.close)))
    .map((x) => ({
      date: x.date instanceof Date ? x.date.toISOString().slice(0, 10) : String(x.date).slice(0, 10),
      close: Number(x.close),
      high: x.high != null && Number.isFinite(Number(x.high)) ? Number(x.high) : undefined,
      low: x.low != null && Number.isFinite(Number(x.low)) ? Number(x.low) : undefined,
      volume: x.volume != null && Number.isFinite(Number(x.volume)) ? Number(x.volume) : undefined,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchDailyPrices(resolved: string, period2: Date, signal?: AbortSignal): Promise<{ bars: HistoricalEodBar[]; dividends: Array<{ date: string; amount: number }> | null }> {
  // historical() wraps this same endpoint; a second fallback request only repeats the failure.
  const chartDaily = await priceRequest((options) => yahooFinance.chart(resolved, {
      period1: DAILY_HISTORY_START,
      period2,
      interval: "1d",
      return: "array",
      events: "div",
    }, options), `daily history ${resolved}`, signal).catch(() => null);
  let bars: HistoricalEodBar[] = [];
  if (chartDaily && typeof chartDaily === "object" && "quotes" in chartDaily) {
    const quotes = (chartDaily as { quotes: Parameters<typeof mapChartQuotesToBars>[0] }).quotes;
    bars = mapChartQuotesToBars(quotes ?? []);
  }
  const dividendStart = new Date();
  dividendStart.setFullYear(dividendStart.getFullYear() - 12);
  return {
    bars,
    dividends: chartDaily == null ? null : extractYahooDividendEvents(chartDaily)
      .filter((event) => event.date >= dividendStart.toISOString().slice(0, 10)),
  };
}

/** Parse Yahoo chart `events.dividends` (array or timestamp-keyed object). */
function extractYahooDividendEvents(chartResult: unknown): Array<{ date: string; amount: number }> {
  if (!chartResult || typeof chartResult !== "object") return [];
  const ev = (chartResult as { events?: { dividends?: unknown } }).events?.dividends;
  if (ev == null) return [];
  const raw = Array.isArray(ev) ? ev : Object.values(ev as Record<string, unknown>);
  const out: Array<{ date: string; amount: number }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as { date?: Date; amount?: unknown };
    const d = o.date instanceof Date ? o.date.toISOString().slice(0, 10) : null;
    const amt = typeof o.amount === "number" ? o.amount : Number(o.amount);
    if (!d || !Number.isFinite(amt) || amt <= 0) continue;
    out.push({ date: d, amount: amt });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function needsYahooDpsBackfill(bundle: StockAnalysisBundle): boolean {
  const rows = bundle.dividendQuarterly;
  if (rows.length === 0) return false;
  return rows.some((p) => p.dividendPerShare == null || p.dividendPerShare === 0);
}

type DividendQuarterlyCurrencyBundle = StockAnalysisBundle & {
  __financialCurrency?: string;
  /** Set when every positive DPS row is listing/quote currency. */
  __dividendQuarterlyCurrency?: string;
  /** Quarter-end dates whose DPS is listing cash (major units), not reporting currency. */
  __dividendListingDates?: string[];
  /** Successful full daily chart refresh; quote/intraday requests stay live. */
  __dailyHistoryRefreshedAt?: string;
  /** Successful dividend-history check, including a valid empty non-payer result. */
  __dividendHistoryRefreshedAt?: string;
};

type DividendMergeResult = { writtenDates: string[] };

/**
 * Sums Yahoo ex-dividend cash into fiscal quarter windows.
 * Those amounts are listing currency — EUR on FB2A.DE, pence on VOD.L, USD on META.
 * `fill-gaps` only replaces null/0. `overwrite` replaces reporting-currency DPS
 * where the clamped window has cash, so a later FX pass can skip just those rows.
 */
async function fetchYahooDividendEvents(
  resolvedYahooSymbol: string,
  signal?: AbortSignal,
): Promise<Array<{ date: string; amount: number }> | null> {
  const period2 = new Date();
  const period1 = new Date(period2);
  period1.setFullYear(period1.getFullYear() - 12);

  const chartResult = await priceRequest((options) => yahooFinance.chart(resolvedYahooSymbol, {
        period1,
        period2,
        interval: "1d",
        return: "array",
        events: "div",
      }, options), `dividend history ${resolvedYahooSymbol}`, signal).catch(() => null);
  return chartResult == null ? null : extractYahooDividendEvents(chartResult);
}

/** Apply fetched events only after the listing quote and currency have been validated. */
function mergeYahooExDividendsIntoQuarterly(
  bundle: StockAnalysisBundle,
  divs: Array<{ date: string; amount: number }>,
  mode: "fill-gaps" | "overwrite",
): DividendMergeResult {
  if (divs.length === 0) return { writtenDates: [] };

  const tagged = bundle as DividendQuarterlyCurrencyBundle;
  const previousListing = tagged.__dividendListingDates ?? [];
  const applied = overlayQuarterlyDividends(bundle.dividendQuarterly, divs, mode);
  let rows = applied.rows;
  let listingDates = [...new Set([...previousListing, ...applied.listingDates])];
  if (mode === "overwrite") {
    // Pass the ex-div events so a cached open-window pile-up is cleared even
    // when the previous commit never wrote __dividendListingDates.
    const repaired = dropStaleOpenWindowSum(rows, applied.listingDates, previousListing, divs);
    rows = repaired.rows;
    listingDates = [...new Set([...repaired.listingDates, ...applied.listingDates])];
  }
  bundle.dividendQuarterly = rows;
  tagged.__dividendListingDates = listingDates;
  return { writtenDates: applied.listingDates };
}

function checkedRecently(timestamp: string | undefined, now: number): boolean {
  if (!timestamp) return false;
  const age = now - Date.parse(timestamp);
  return Number.isFinite(age) && age >= 0 && age < DAILY_HISTORY_REFRESH_MS;
}

/**
 * Overwrites {@link StockAnalysisBundle.quote}, {@link StockAnalysisBundle.historical}, and
 * {@link StockAnalysisBundle.intraday} from Yahoo; may fill {@link StockAnalysisBundle.dividendQuarterly}
 * from Yahoo ex-dividend history when Gemini left gaps. No-op if Yahoo fails (keeps Gemini/cache values).
 */
export async function enrichBundleWithYahooPrices(bundle: StockAnalysisBundle, signal?: AbortSignal): Promise<void> {
  const inputSym = bundle.quote.symbol.trim().toUpperCase() || "AAPL";
  // Ensure cached/Gemini past dates never surface even if Yahoo is unavailable.
  sanitizeQuoteEarningsDate(bundle.quote);

  try {
    const resolution = await resolveYahooSymbol(inputSym, signal);
    const resolved = resolution.symbol;
    const rawQuote = resolution.quote;
    if (!Number.isFinite(Number(rawQuote.regularMarketPrice)) || Number(rawQuote.regularMarketPrice) <= 0) return;
    const period2 = new Date();
    const period2Str = period2.toISOString().slice(0, 10);
    const intradayPeriod1 = new Date(period2);
    intradayPeriod1.setDate(intradayPeriod1.getDate() - 7);

    const existingHistLen = bundle.historical?.length ?? 0;
    const tagged = bundle as DividendQuarterlyCurrencyBundle;
    const reuseDailyHistory = existingHistLen > 1
      && bundle.historical.every((bar) => Number.isFinite(bar.close) && bar.close > 0)
      && checkedRecently(tagged.__dailyHistoryRefreshedAt, period2.getTime());

    const [dailyResult, chartIntraday, quoteSummaryResult, fxQuote] =
      await Promise.all([
        reuseDailyHistory ? Promise.resolve({ bars: [] as HistoricalEodBar[], dividends: null }) : fetchDailyPrices(resolved, period2, signal),
        priceRequest((options) => yahooFinance.chart(resolved, {
            period1: intradayPeriod1,
            period2: period2,
            interval: "5m",
            return: "array",
          }, options), `intraday ${resolved}`, signal)
          .catch(() => null),
        priceRequest((options) => yahooFinance.quoteSummary(resolved, {
            modules: [
              "calendarEvents",
              "summaryDetail",
              "financialData",
              "defaultKeyStatistics",
              "price",
            ],
          }, options), `quote summary ${resolved}`, signal)
          .catch(() => null),
        priceRequest((options) => yahooFinance.quote("EURUSD=X", {}, options), "EUR/USD", signal).catch(() => null),
      ]);
    signal?.throwIfAborted();
    const dailyBars = dailyResult.bars;

    if (dailyBars.length > 0) {
      bundle.historical = dailyBars;
    } else if (existingHistLen <= 1) {
      const px = Number(rawQuote.regularMarketPrice ?? 0);
      if (px > 0) {
        bundle.historical = [{ date: period2Str, close: px }];
      }
    }

    const qs =
      quoteSummaryResult && typeof quoteSummaryResult === "object"
        ? (quoteSummaryResult as Record<string, unknown>)
        : null;

    bundle.quote = mapQuote(resolved, rawQuote, qs);
    bundle.investor = mapInvestorMetrics(rawQuote, qs);

    // Reporting currency vs listing currency. GBp is pence of GBP, not a
    // separate currency (ASML reports EUR / quotes USD; FB2A.DE quotes EUR /
    // Meta reports USD; VOD.L quotes GBp / reports EUR).
    const finRaw = typeof rawQuote.financialCurrency === "string" ? rawQuote.financialCurrency : "";
    const quoteRaw = bundle.investor?.currency ?? "";
    const finCcy = quoteCurrencyMajor(finRaw);
    const quoteCcy = quoteCurrencyMajor(quoteRaw);
    if (finCcy.code) tagged.__financialCurrency = finCcy.code;

    const overwriteDividends = tagged.__financialCurrency && quoteCcy.code && tagged.__financialCurrency !== quoteCcy.code;
    const dividendsNeeded = bundle.dividendQuarterly.length > 0 && (overwriteDividends || needsYahooDpsBackfill(bundle));
    let dividendEvents = dailyResult.dividends;
    if (dividendsNeeded && dividendEvents == null && !checkedRecently(tagged.__dividendHistoryRefreshedAt, period2.getTime())) {
      dividendEvents = await fetchYahooDividendEvents(resolved, signal);
    }
    const applied = dividendsNeeded && dividendEvents != null
      ? mergeYahooExDividendsIntoQuarterly(bundle, dividendEvents, overwriteDividends ? "overwrite" : "fill-gaps")
      : { writtenDates: [] as string[] };
    const writtenNow = new Set(applied.writtenDates.map((date) => date.slice(0, 10)));
    if (dividendEvents != null) tagged.__dividendHistoryRefreshedAt = new Date().toISOString();

    if (isPenceQuoteCurrency(quoteRaw)) {
      // Chart ex-div cash is pence. Annual dividendRate is usually already pounds.
      for (const row of bundle.dividendQuarterly) {
        if (!writtenNow.has(row.date.slice(0, 10)) || row.dividendPerShare == null) continue;
        row.dividendPerShare = row.dividendPerShare / 100;
      }
      const majorRate = dividendRateToMajorUnits(
        bundle.investor.dividendRate,
        bundle.quote.price,
        quoteRaw,
      );
      bundle.investor = { ...bundle.investor, currency: "GBP", dividendRate: majorRate };
    }

    const listingDates = tagged.__dividendListingDates ?? [];
    const unmarkedPositive = bundle.dividendQuarterly.some((row) => {
      const dps = row.dividendPerShare;
      return dps != null && dps > 0 && !listingDates.includes(row.date.slice(0, 10));
    });
    if (quoteCcy.code && listingDates.length > 0 && !unmarkedPositive) {
      tagged.__dividendQuarterlyCurrency = quoteCcy.code;
    }

    if ((bundle.historical?.length ?? 0) === 0 && bundle.quote.price > 0) {
      bundle.historical = [{ date: period2Str, close: bundle.quote.price }];
    }

    let intraday: HistoricalEodBar[] | undefined;
    if (chartIntraday && typeof chartIntraday === "object" && "quotes" in chartIntraday) {
      const quotes = (chartIntraday as { quotes: Array<{ date: Date; close?: number | null }> })
        .quotes;
      intraday = (quotes ?? [])
        .filter((x) => x?.date && x.close != null && Number.isFinite(Number(x.close)))
        .map((x) => ({
          date: x.date instanceof Date ? x.date.toISOString() : String(x.date),
          close: Number(x.close),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (intraday.length === 0) intraday = undefined;
    }
    bundle.intraday = intraday;

    const fxQ = Array.isArray(fxQuote) ? fxQuote[0] : fxQuote;
    let eurPerUsd: number | null = null;
    if (fxQ && typeof fxQ === "object") {
      const eurUsd = Number((fxQ as { regularMarketPrice?: unknown }).regularMarketPrice);
      if (Number.isFinite(eurUsd) && eurUsd > 0) {
        eurPerUsd = 1 / eurUsd;
      }
    }
    bundle.eurPerUsd = eurPerUsd;
    if (dailyBars.length > 0) tagged.__dailyHistoryRefreshedAt = new Date().toISOString();
  } catch {
    // Keep Gemini/cache OHLCV and quote if Yahoo is unavailable.
  }
}

/**
 * If the fundamentals are reported in a different currency than the live quote
 * (ADRs — e.g. ASML reports EUR, the NASDAQ ADR quotes USD), scale the monetary
 * fundamentals into the quote currency with a current FX rate so charts, P/E and
 * valuation are all consistent. Display-only: call AFTER persisting the
 * native-currency bundle. Mutates `bundle`.
 */
export async function reconcileFundamentalsCurrency(bundle: StockAnalysisBundle, signal?: AbortSignal): Promise<void> {
  const tagged = bundle as DividendQuarterlyCurrencyBundle;
  const fin = quoteCurrencyMajor(tagged.__financialCurrency);
  const quote = quoteCurrencyMajor(bundle.investor?.currency);
  if (!fin.code || !quote.code || fin.code === quote.code) return;
  try {
    const fx = await priceRequest((options) => yahooFinance.quote(`${fin.code}${quote.code}=X`, {}, options), `report FX ${fin.code}/${quote.code}`, signal);
    const f = Array.isArray(fx) ? fx[0] : fx;
    const rate = Number((f as { regularMarketPrice?: unknown })?.regularMarketPrice);
    if (!Number.isFinite(rate) || rate <= 0) return;
    const plan = dividendFxPlan({
      listingDates: tagged.__dividendListingDates,
      stampedQuoteCurrency: tagged.__dividendQuarterlyCurrency,
      quoteCurrency: quote.code,
      points: bundle.dividendQuarterly,
      quoteAnnualDividend: bundle.investor.dividendRate,
      quotePerFinancial: rate,
    });
    convertBundleFundamentals(bundle, rate, { convertDividends: false });
    if (plan === "all") {
      bundle.dividendQuarterly = applyDividendFx(bundle.dividendQuarterly, null, rate);
    } else if (plan === "unmarked") {
      bundle.dividendQuarterly = applyDividendFx(
        bundle.dividendQuarterly,
        new Set((tagged.__dividendListingDates ?? []).map((d) => d.slice(0, 10))),
        rate,
      );
    }
    bundle.investor = { ...bundle.investor, currency: quote.code };
  } catch {
    /* keep native-currency fundamentals if the FX fetch fails */
  }
}
