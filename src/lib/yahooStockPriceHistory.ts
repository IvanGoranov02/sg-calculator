/**
 * Server-only: Yahoo Finance for live quote + daily/intraday price history only.
 * Fundamentals stay from Gemini/cache; this overwrites quote.historical/intraday on each load.
 */

import YahooFinance from "yahoo-finance2";

import type { HistoricalEodBar, StockAnalysisBundle, StockQuote } from "@/lib/stockAnalysisTypes";

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

/**
 * Overwrites {@link StockAnalysisBundle.quote}, {@link StockAnalysisBundle.historical}, and
 * {@link StockAnalysisBundle.intraday} from Yahoo. No-op if Yahoo fails (keeps Gemini/cache values).
 */
export async function enrichBundleWithYahooPrices(bundle: StockAnalysisBundle): Promise<void> {
  const inputSym = bundle.quote.symbol.trim().toUpperCase() || "AAPL";

  try {
    const resolved = await resolveYahooSymbol(inputSym);
    const period2 = new Date();
    const period2Str = period2.toISOString().slice(0, 10);
    const intradayPeriod1 = new Date(period2);
    intradayPeriod1.setDate(intradayPeriod1.getDate() - 7);

    const [quoteResult, historicalResult, chartIntraday, quoteSummaryResult] = await Promise.all([
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
