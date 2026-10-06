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
import { resolveNextEarningsOrEstimate } from "@/lib/calendarEvents";
import { mapInvestorMetrics } from "@/lib/mapInvestorMetrics";
import { dividendRateToMajorUnits, isPenceQuoteCurrency, quoteCurrencyMajor } from "@/lib/portfolioFx";
import type { HistoricalEodBar, StockAnalysisBundle, StockQuote } from "@/lib/stockAnalysisTypes";
import { yahooFinance } from "@/lib/yahooFinanceClient";

const DAILY_HISTORY_START = "1990-01-01";

async function resolveYahooSymbol(input: string): Promise<string> {
  const trimmed = input.trim();
  const sym = trimmed.toUpperCase();
  if (!sym) throw new Error("Empty ticker.");

  try {
    const quoteResult = await yahooFinance.quote(sym);
    const q = Array.isArray(quoteResult) ? quoteResult[0] : quoteResult;
    if (q && (q as { quoteType?: string }).quoteType !== "NONE") {
      return String((q as { symbol?: string }).symbol ?? sym).toUpperCase();
    }
  } catch {
    // Quote timed out / failed — fall through to search before failing closed.
  }

  try {
    const searchResult = await yahooFinance.search(trimmed, { quotesCount: 15 });
    const hit = searchResult.quotes.find((row) => {
      if (typeof row !== "object" || row === null || !("symbol" in row)) return false;
      const r = row as { symbol?: string; quoteType?: string; isYahooFinance?: boolean };
      return (
        r.isYahooFinance === true &&
        r.quoteType === "EQUITY" &&
        typeof r.symbol === "string"
      );
    }) as { symbol: string } | undefined;

    if (hit?.symbol) return hit.symbol.toUpperCase();
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

type HistRow = {
  date: Date;
  close?: number;
  high?: number;
  low?: number;
  volume?: number;
};

function mapHistoricalRows(histArr: HistRow[]): HistoricalEodBar[] {
  return (histArr ?? [])
    .filter((h) => h?.date && h.close !== undefined)
    .map((h) => {
      const d =
        h.date instanceof Date ? h.date.toISOString().slice(0, 10) : String(h.date).slice(0, 10);
      return {
        date: d,
        close: Number(h.close),
        high: h.high !== undefined ? Number(h.high) : undefined,
        low: h.low !== undefined ? Number(h.low) : undefined,
        volume: h.volume !== undefined ? Number(h.volume) : undefined,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
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

async function fetchDailyPriceBars(resolved: string, period2Str: string): Promise<HistoricalEodBar[]> {
  const historicalResult = await yahooFinance
    .historical(resolved, {
      period1: DAILY_HISTORY_START,
      period2: period2Str,
      interval: "1d",
    })
    .catch(() => [] as HistRow[]);

  let bars = mapHistoricalRows(historicalResult as HistRow[]);
  if (bars.length > 0) return bars;

  const chartDaily = await yahooFinance
    .chart(resolved, {
      period1: DAILY_HISTORY_START,
      period2: period2Str,
      interval: "1d",
      return: "array",
    })
    .catch(() => null);

  if (chartDaily && typeof chartDaily === "object" && "quotes" in chartDaily) {
    const quotes = (chartDaily as { quotes: Parameters<typeof mapChartQuotesToBars>[0] }).quotes;
    bars = mapChartQuotesToBars(quotes ?? []);
  }
  return bars;
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

/** `historical(..., { events: "dividends" })` — often fills gaps when chart events are empty. */
function extractHistoricalDividendRows(rows: unknown): Array<{ date: string; amount: number }> {
  if (!Array.isArray(rows)) return [];
  const out: Array<{ date: string; amount: number }> = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as { date?: Date; dividends?: unknown };
    const d = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : null;
    const amt = typeof r.dividends === "number" ? r.dividends : Number(r.dividends);
    if (!d || !Number.isFinite(amt) || amt <= 0) continue;
    out.push({ date: d, amount: amt });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Prefer chart ex-dates; add historical-only dates (some tickers omit chart events). */
function mergeChartAndHistoricalDividends(
  chart: Array<{ date: string; amount: number }>,
  historical: Array<{ date: string; amount: number }>,
): Array<{ date: string; amount: number }> {
  const byDate = new Map<string, number>();
  for (const x of chart) byDate.set(x.date, x.amount);
  for (const x of historical) {
    if (!byDate.has(x.date)) byDate.set(x.date, x.amount);
  }
  return [...byDate.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
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
};

type DividendMergeResult = { writtenDates: string[] };

/**
 * Sums Yahoo ex-dividend cash into fiscal quarter windows.
 * Those amounts are listing currency — EUR on FB2A.DE, pence on VOD.L, USD on META.
 * `fill-gaps` only replaces null/0. `overwrite` replaces reporting-currency DPS
 * where the clamped window has cash, so a later FX pass can skip just those rows.
 */
async function mergeYahooExDividendsIntoQuarterly(
  bundle: StockAnalysisBundle,
  resolvedYahooSymbol: string,
  mode: "fill-gaps" | "overwrite" = "fill-gaps",
): Promise<DividendMergeResult> {
  if (mode === "fill-gaps" && !needsYahooDpsBackfill(bundle)) return { writtenDates: [] };

  const period2 = new Date();
  const period1 = new Date(period2);
  period1.setFullYear(period1.getFullYear() - 12);

  const [chartResult, histRows] = await Promise.all([
    yahooFinance
      .chart(resolvedYahooSymbol, {
        period1,
        period2,
        interval: "1d",
        return: "array",
        events: "div",
      })
      .catch(() => null),
    yahooFinance
      .historical(resolvedYahooSymbol, {
        period1,
        period2,
        events: "dividends",
      })
      .catch(() => []),
  ]);

  const fromChart = extractYahooDividendEvents(chartResult);
  const fromHist = extractHistoricalDividendRows(histRows);
  const divs = mergeChartAndHistoricalDividends(fromChart, fromHist);
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

/**
 * Overwrites {@link StockAnalysisBundle.quote}, {@link StockAnalysisBundle.historical}, and
 * {@link StockAnalysisBundle.intraday} from Yahoo; may fill {@link StockAnalysisBundle.dividendQuarterly}
 * from Yahoo ex-dividend history when Gemini left gaps. No-op if Yahoo fails (keeps Gemini/cache values).
 */
export async function enrichBundleWithYahooPrices(bundle: StockAnalysisBundle): Promise<void> {
  const inputSym = bundle.quote.symbol.trim().toUpperCase() || "AAPL";
  // Ensure cached/Gemini past dates never surface even if Yahoo is unavailable.
  sanitizeQuoteEarningsDate(bundle.quote);

  try {
    const resolved = await resolveYahooSymbol(inputSym);
    const period2 = new Date();
    const period2Str = period2.toISOString().slice(0, 10);
    const intradayPeriod1 = new Date(period2);
    intradayPeriod1.setDate(intradayPeriod1.getDate() - 7);

    const existingHistLen = bundle.historical?.length ?? 0;

    const [quoteResult, dailyBars, chartIntraday, quoteSummaryResult, fxQuote, gapFillDividends] =
      await Promise.all([
        yahooFinance.quote(resolved).catch(() => null),
        fetchDailyPriceBars(resolved, period2Str),
        yahooFinance
          .chart(resolved, {
            period1: intradayPeriod1,
            period2: period2,
            interval: "5m",
            return: "array",
          })
          .catch(() => null),
        yahooFinance
          .quoteSummary(resolved, {
            modules: [
              "calendarEvents",
              "summaryDetail",
              "financialData",
              "defaultKeyStatistics",
              "price",
            ],
          })
          .catch(() => null),
        yahooFinance.quote("EURUSD=X").catch(() => null),
        mergeYahooExDividendsIntoQuarterly(bundle, resolved, "fill-gaps").catch(() => ({
          writtenDates: [] as string[],
        })),
      ]);

    const q = Array.isArray(quoteResult) ? quoteResult[0] : quoteResult;
    const quoteValid = q && (q as { quoteType?: string }).quoteType !== "NONE";

    if (dailyBars.length > 0) {
      bundle.historical = dailyBars;
    } else if (existingHistLen <= 1 && quoteValid) {
      const rawQuote = q as Record<string, unknown>;
      const px = Number(rawQuote.regularMarketPrice ?? 0);
      if (px > 0) {
        bundle.historical = [{ date: period2Str, close: px }];
      }
    }

    if (!quoteValid) {
      sanitizeQuoteEarningsDate(bundle.quote);
      return;
    }

    const rawQuote = q as Record<string, unknown>;
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
    const tagged = bundle as DividendQuarterlyCurrencyBundle;
    if (finCcy.code) tagged.__financialCurrency = finCcy.code;

    const writtenNow = new Set(gapFillDividends.writtenDates.map((d) => d.slice(0, 10)));
    if (finCcy.code && quoteCcy.code && finCcy.code !== quoteCcy.code) {
      const overwritten = await mergeYahooExDividendsIntoQuarterly(
        bundle,
        resolved,
        "overwrite",
      ).catch(() => ({ writtenDates: [] as string[] }));
      for (const d of overwritten.writtenDates) writtenNow.add(d.slice(0, 10));
    }

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
export async function reconcileFundamentalsCurrency(bundle: StockAnalysisBundle): Promise<void> {
  const tagged = bundle as DividendQuarterlyCurrencyBundle;
  const fin = quoteCurrencyMajor(tagged.__financialCurrency);
  const quote = quoteCurrencyMajor(bundle.investor?.currency);
  if (!fin.code || !quote.code || fin.code === quote.code) return;
  try {
    const fx = await yahooFinance.quote(`${fin.code}${quote.code}=X`);
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
