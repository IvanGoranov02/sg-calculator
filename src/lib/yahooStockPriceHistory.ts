/**
 * Server-only: Yahoo Finance for live quote, daily/intraday prices, and (when needed) ex-dividend
 * amounts merged into quarterly dividend-per-share. Fundamentals stay from Gemini/cache.
 */

import YahooFinance from "yahoo-finance2";

import type { HistoricalEodBar, StockAnalysisBundle, StockQuote } from "@/lib/stockAnalysisTypes";
import { sortQuarterlyByDateAsc } from "@/lib/stockAnalysisTypes";

const yahooFinance = new YahooFinance({
  suppressNotices: ["ripHistorical", "yahooSurvey"],
});

const DAILY_HISTORY_START = "1990-01-01";

async function resolveYahooSymbol(input: string): Promise<string> {
  const trimmed = input.trim();
  const sym = trimmed.toUpperCase();
  if (!sym) throw new Error("Empty ticker.");

  const quoteResult = await yahooFinance.quote(sym);
  const q = Array.isArray(quoteResult) ? quoteResult[0] : quoteResult;
  if (q && (q as { quoteType?: string }).quoteType !== "NONE") {
    return String((q as { symbol?: string }).symbol ?? sym).toUpperCase();
  }

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

  throw new Error(`Ticker "${sym}" was not found on Yahoo Finance.`);
}

function toIsoDate(d: unknown): string | null {
  if (d == null || d === "") return null;
  const dt = d instanceof Date ? d : new Date(String(d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function pickNextEarningsFromCalendar(qs: Record<string, unknown> | null): string | null {
  if (!qs) return null;
  const ce = qs.calendarEvents as { earnings?: { earningsDate?: Date[] } } | undefined;
  const dates = ce?.earnings?.earningsDate;
  if (!Array.isArray(dates) || dates.length === 0) return null;
  const parsed = dates
    .map((x) => (x instanceof Date ? x : new Date(x as string)))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (parsed.length === 0) return null;
  const t0 = Date.now() - 86400000;
  const upcoming = parsed.filter((d) => d.getTime() >= t0).sort((a, b) => a.getTime() - b.getTime());
  const pick = upcoming[0] ?? parsed[parsed.length - 1];
  return pick.toISOString().slice(0, 10);
}

function mapQuote(resolvedSym: string, raw: Record<string, unknown>): StockQuote {
  const q = raw;
  const price = Number(q.regularMarketPrice ?? 0);
  const change = Number(q.regularMarketChange ?? 0);
  let pct = Number(q.regularMarketChangePercent ?? NaN);
  if (!Number.isFinite(pct)) {
    const prev = price - change;
    pct = prev !== 0 ? (change / prev) * 100 : 0;
  }
  const earningsDate =
    toIsoDate(q.earningsTimestamp) ??
    toIsoDate(q.earningsTimestampStart) ??
    null;

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
  };
}

function numField(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

/**
 * Sums Yahoo ex-dividend cash amounts into fiscal quarter windows (period-end dates from the bundle).
 * Only writes quarters where Gemini left null or 0 and Yahoo has a positive sum for that window.
 */
async function mergeYahooExDividendsIntoQuarterly(
  bundle: StockAnalysisBundle,
  resolvedYahooSymbol: string,
): Promise<void> {
  if (!needsYahooDpsBackfill(bundle)) return;

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
  if (divs.length === 0) return;

  const sorted = sortQuarterlyByDateAsc(bundle.dividendQuarterly);
  const next: typeof bundle.dividendQuarterly = [];

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    const end = row.date.slice(0, 10);
    const prevEnd = i > 0 ? sorted[i - 1]!.date.slice(0, 10) : "1900-01-01";

    let sum = 0;
    for (const { date: ex, amount } of divs) {
      if (ex > prevEnd && ex <= end) sum += amount;
    }

    const rounded = Math.round(sum * 1e6) / 1e6;
    const cur = row.dividendPerShare;
    const shouldFill = rounded > 0 && (cur == null || cur === 0);

    if (shouldFill) {
      next.push({ ...row, dividendPerShare: rounded });
    } else {
      next.push(row);
    }
  }

  bundle.dividendQuarterly = next;
}

/**
 * Overwrites {@link StockAnalysisBundle.quote}, {@link StockAnalysisBundle.historical}, and
 * {@link StockAnalysisBundle.intraday} from Yahoo; may fill {@link StockAnalysisBundle.dividendQuarterly}
 * from Yahoo ex-dividend history when Gemini left gaps. No-op if Yahoo fails (keeps Gemini/cache values).
 */
export async function enrichBundleWithYahooPrices(bundle: StockAnalysisBundle): Promise<void> {
  const inputSym = bundle.quote.symbol.trim().toUpperCase() || "AAPL";

  try {
    const resolved = await resolveYahooSymbol(inputSym);
    const period2 = new Date();
    const period2Str = period2.toISOString().slice(0, 10);
    const intradayPeriod1 = new Date(period2);
    intradayPeriod1.setDate(intradayPeriod1.getDate() - 7);

    const [quoteResult, historicalResult, chartIntraday, quoteSummaryResult, _dpsMerge] =
      await Promise.all([
        yahooFinance.quote(resolved),
        yahooFinance.historical(resolved, {
          period1: DAILY_HISTORY_START,
          period2: period2Str,
          interval: "1d",
        }),
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
            modules: ["calendarEvents"],
          })
          .catch(() => null),
        mergeYahooExDividendsIntoQuarterly(bundle, resolved),
      ]);

    const q = Array.isArray(quoteResult) ? quoteResult[0] : quoteResult;
    if (!q || (q as { quoteType?: string }).quoteType === "NONE") return;

    const rawQuote = q as Record<string, unknown>;
    const qs =
      quoteSummaryResult && typeof quoteSummaryResult === "object"
        ? (quoteSummaryResult as Record<string, unknown>)
        : null;

    let quote = mapQuote(resolved, rawQuote);
    if (!quote.earningsDate && qs) {
      const fromCal = pickNextEarningsFromCalendar(qs);
      if (fromCal) quote = { ...quote, earningsDate: fromCal };
    }

    bundle.quote = quote;

    const histArr = historicalResult as Array<{
      date: Date;
      close?: number;
      high?: number;
      low?: number;
      volume?: number;
    }>;
    const historical: HistoricalEodBar[] = (histArr ?? [])
      .filter((h) => h?.date && h.close !== undefined)
      .map((h) => {
        const d =
          h.date instanceof Date
            ? h.date.toISOString().slice(0, 10)
            : String(h.date).slice(0, 10);
        return {
          date: d,
          close: Number(h.close),
          high: h.high !== undefined ? Number(h.high) : undefined,
          low: h.low !== undefined ? Number(h.low) : undefined,
          volume: h.volume !== undefined ? Number(h.volume) : undefined,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    if (historical.length > 0) {
      bundle.historical = historical;
    } else if (quote.price > 0) {
      bundle.historical = [{ date: period2Str, close: quote.price }];
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
  } catch {
    // Keep Gemini/cache OHLCV and quote if Yahoo is unavailable.
  }
}
