/**
 * Server-only: batch Yahoo quotes + dividend metrics for portfolio rows.
 * Order: T212-mapped tickers → stored symbolYahoo → EU suffix fallbacks → Yahoo search.
 * Prefer T212 broker price when supplied (same currency as holding cost).
 */

import YahooFinance from "yahoo-finance2";

import { mapInvestorMetrics } from "@/lib/mapInvestorMetrics";
import { normalizeYahooDividendYieldToDecimal } from "@/lib/format";
import { normalizePortfolioCurrency, normalizeQuotePrice, isPenceQuoteCurrency } from "@/lib/portfolioFx";
import { parseT212Ticker, t212TickerToYahooCandidates } from "@/lib/t212Ticker";

const yahooFinance = new YahooFinance({
  suppressNotices: ["ripHistorical", "yahooSurvey"],
});

export type PortfolioQuoteRow = {
  symbol: string;
  /** Yahoo symbol used to fetch this row (may differ from portfolio key, e.g. AMZD-EQ → AMZ.DE). */
  resolvedYahooSymbol?: string;
  name: string;
  price: number;
  currency: string;
  dividendYield: number | null;
  dividendRate: number | null;
  changePercent: number;
  /** 200-day moving average from Yahoo, when available. */
  twoHundredDayAverage: number | null;
  /** (price - sma200) / sma200 * 100; null if SMA missing. Negative = trading below trend (a dip). */
  dipVsSma200Pct: number | null;
  /** Next earnings date (ISO yyyy-mm-dd) from Yahoo calendar, when available. */
  nextEarnings: string | null;
  /** GICS-style sector from Yahoo assetProfile, when available. */
  sector: string | null;
  /** True when price comes from the broker sync rather than Yahoo. */
  fromBroker?: boolean;
};

/** Next upcoming (or most recent) earnings date from a Yahoo quoteSummary calendarEvents block. */
function pickNextEarnings(qs: Record<string, unknown> | null): string | null {
  if (!qs) return null;
  const ce = qs.calendarEvents as { earnings?: { earningsDate?: Array<Date | string> } } | undefined;
  const dates = ce?.earnings?.earningsDate;
  if (!Array.isArray(dates) || dates.length === 0) return null;
  const parsed = dates
    .map((x) => (x instanceof Date ? x : new Date(x)))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (parsed.length === 0) return null;
  const t0 = Date.now() - 86_400_000;
  const upcoming = parsed.filter((d) => d.getTime() >= t0).sort((a, b) => a.getTime() - b.getTime());
  const pick = upcoming[0] ?? parsed[parsed.length - 1];
  return pick.toISOString().slice(0, 10);
}

/** Build candidate Yahoo tickers for a stored portfolio symbol (often T212-derived). */
function buildYahooSymbolCandidates(portfolioSymbol: string): string[] {
  const u = portfolioSymbol.trim().toUpperCase();
  const out: string[] = [];
  const add = (s: string) => {
    const x = s.trim();
    if (x && !out.includes(x)) out.push(x);
  };

  add(u);
  if (u.endsWith("-EQ")) {
    const base = u.slice(0, -3);
    add(base);
    if (base.length >= 5 && base.endsWith("A")) {
      add(`${base.slice(0, -1)}.AS`);
    }
    for (const suf of [
      ".DE",
      ".L",
      ".PA",
      ".AS",
      ".SW",
      ".MI",
      ".F",
      ".BR",
      ".ST",
      ".OL",
      ".VI",
      ".XD",
      ".XC",
    ]) {
      add(base + suf);
    }
    if (base.length > 2 && /[A-Z]D$/.test(base)) {
      add(base.slice(0, -1));
    }
  }

  return out;
}

/** Try Yahoo in a stable order: T212 mapping → UI symbol → heuristics. */
function buildOrderedCandidates(
  symbolYahoo: string,
  symbolT212: string | null,
  holdingCurrency: string | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (s: string) => {
    const x = s.trim().toUpperCase();
    if (!x || seen.has(x)) return;
    seen.add(x);
    out.push(x);
  };

  const parsedT212 = symbolT212 ? parseT212Ticker(symbolT212) : null;

  if (symbolT212) {
    for (const c of t212TickerToYahooCandidates(symbolT212, holdingCurrency)) {
      push(c);
    }
  }

  push(symbolYahoo.trim().toUpperCase());
  for (const c of buildYahooSymbolCandidates(symbolYahoo)) {
    push(c);
  }

  // Avoid US ADR / ETF traps (e.g. AMZD bear ETF) when T212 says EU listing.
  if (parsedT212?.isNonUsListing) {
    const blocked = new Set<string>();
    const base = parsedT212.base;
    if (base.length >= 3) blocked.add(base);
    if (base.length > 3 && /[A-Z]D$/.test(base)) blocked.add(base);
    return out.filter((sym) => !blocked.has(sym));
  }

  return out;
}

function rawQuoteToRow(
  portfolioKey: string,
  resolvedYahoo: string,
  raw: Record<string, unknown>,
  qs: Record<string, unknown> | null,
): PortfolioQuoteRow | null {
  if (raw.quoteType === "NONE") return null;
  const rawPrice = Number(raw.regularMarketPrice ?? 0);
  if (!Number.isFinite(rawPrice) || rawPrice <= 0) return null;

  const metrics = mapInvestorMetrics(raw, qs);
  const normalized = normalizeQuotePrice(rawPrice, metrics.currency);
  const price = normalized.price;
  const currency = normalized.currency;

  const pct = Number(raw.regularMarketChangePercent ?? 0);
  const yieldDec = normalizeYahooDividendYieldToDecimal(metrics.dividendYield);
  const smaRaw = metrics.twoHundredDayAverage;
  const sma =
    smaRaw != null && isPenceQuoteCurrency(metrics.currency) ? smaRaw / 100 : smaRaw;
  const dipVsSma200Pct =
    sma != null && sma !== 0 && Number.isFinite(price) ? ((price - sma) / sma) * 100 : null;

  let dividendRate = metrics.dividendRate;
  if (dividendRate != null && isPenceQuoteCurrency(metrics.currency)) {
    dividendRate = dividendRate / 100;
  }

  return {
    symbol: portfolioKey,
    resolvedYahooSymbol: resolvedYahoo,
    name: String(raw.longName ?? raw.shortName ?? portfolioKey),
    price,
    currency,
    dividendYield: yieldDec,
    dividendRate,
    changePercent: Number.isFinite(pct) ? pct : 0,
    twoHundredDayAverage: sma,
    dipVsSma200Pct,
    nextEarnings: pickNextEarnings(qs),
    sector: pickSector(qs),
  };
}

function pickSector(qs: Record<string, unknown> | null): string | null {
  const ap = (qs as { assetProfile?: { sector?: unknown } } | null)?.assetProfile;
  const s = ap?.sector;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

function quoteCurrencyScore(row: PortfolioQuoteRow, holdingCurrency: string | null): number {
  const hold = holdingCurrency ? normalizePortfolioCurrency(holdingCurrency) : null;
  const quote = normalizePortfolioCurrency(row.currency);
  if (hold && hold === quote) return 2;
  if (hold === "EUR" && /\.(DE|PA|AS|MI|F|BR|VI|ST|OL|SW)$/i.test(row.resolvedYahooSymbol ?? "")) {
    return 1;
  }
  if (hold === "GBP" && (row.resolvedYahooSymbol ?? "").endsWith(".L")) return 1;
  return 0;
}

async function tryQuoteSymbol(portfolioKey: string, yahooSym: string): Promise<PortfolioQuoteRow | null> {
  try {
    const [q, qs] = await Promise.all([
      yahooFinance.quote(yahooSym),
      yahooFinance
        .quoteSummary(yahooSym, {
          modules: [
            "summaryDetail",
            "financialData",
            "defaultKeyStatistics",
            "price",
            "calendarEvents",
            "assetProfile",
          ],
        })
        .catch(() => null),
    ]);
    const raw = Array.isArray(q) ? q[0] : q;
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    return rawQuoteToRow(portfolioKey, yahooSym, r, qs as Record<string, unknown> | null);
  } catch {
    return null;
  }
}

async function searchFallbackQuote(
  portfolioKey: string,
  holdingCurrency: string | null,
): Promise<PortfolioQuoteRow | null> {
  const stripped = portfolioKey.replace(/-EQ$/i, "").replace(/-/g, " ");
  const query = stripped.trim() || portfolioKey;
  try {
    const r = await yahooFinance.search(query, { quotesCount: 14, newsCount: 0 });
    const quotes = r.quotes ?? [];
    const rows: PortfolioQuoteRow[] = [];
    for (const hit of quotes) {
      if (typeof hit !== "object" || hit === null || !("symbol" in hit)) continue;
      const h = hit as { symbol?: string; quoteType?: string };
      const sym = typeof h.symbol === "string" ? h.symbol : "";
      if (!sym) continue;
      const qt = h.quoteType ?? "";
      if (qt !== "EQUITY" && qt !== "ETF" && qt !== "MUTUALFUND") continue;
      const row = await tryQuoteSymbol(portfolioKey, sym);
      if (row) rows.push(row);
    }
    if (rows.length === 0) return null;
    rows.sort((a, b) => quoteCurrencyScore(b, holdingCurrency) - quoteCurrencyScore(a, holdingCurrency));
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchOnePortfolioQuote(
  portfolioSymbol: string,
  symbolT212: string | null,
  holdingCurrency: string | null,
  brokerPrice: number | null,
  brokerCurrency: string | null,
): Promise<PortfolioQuoteRow | null> {
  const broker =
    brokerPrice != null && Number.isFinite(brokerPrice) && brokerPrice > 0
      ? normalizeQuotePrice(brokerPrice, brokerCurrency ?? holdingCurrency)
      : null;

  const candidates = buildOrderedCandidates(portfolioSymbol, symbolT212, holdingCurrency);
  const rows: PortfolioQuoteRow[] = [];
  for (const c of candidates) {
    const row = await tryQuoteSymbol(portfolioSymbol, c);
    if (row) rows.push(row);
  }

  let best: PortfolioQuoteRow | null = null;
  if (rows.length > 0) {
    rows.sort((a, b) => quoteCurrencyScore(b, holdingCurrency) - quoteCurrencyScore(a, holdingCurrency));
    best = rows[0] ?? null;
  } else {
    best = await searchFallbackQuote(portfolioSymbol, holdingCurrency);
  }

  if (broker) {
    const hold = holdingCurrency ? normalizePortfolioCurrency(holdingCurrency) : null;
    const brokerCcy = normalizePortfolioCurrency(broker.currency);
    const yahooCcy = best ? normalizePortfolioCurrency(best.currency) : null;
    const preferBroker =
      !best ||
      (hold != null && brokerCcy === hold && yahooCcy !== hold) ||
      (hold != null && brokerCcy === hold && yahooCcy === hold);

    if (preferBroker) {
      return {
        symbol: portfolioSymbol,
        resolvedYahooSymbol: best?.resolvedYahooSymbol,
        name: best?.name ?? portfolioSymbol,
        price: broker.price,
        currency: brokerCcy,
        dividendYield: best?.dividendYield ?? null,
        dividendRate: best?.dividendRate ?? null,
        changePercent: best?.changePercent ?? 0,
        twoHundredDayAverage: best?.twoHundredDayAverage ?? null,
        dipVsSma200Pct: best?.dipVsSma200Pct ?? null,
        nextEarnings: best?.nextEarnings ?? null,
        sector: best?.sector ?? null,
        fromBroker: true,
      };
    }
  }

  return best;
}

export type PortfolioHoldingQuoteKey = {
  symbolYahoo: string;
  symbolT212: string | null;
  currency?: string | null;
  brokerPrice?: number | null;
};

export async function fetchPortfolioQuotesForHoldings(
  holdings: PortfolioHoldingQuoteKey[],
): Promise<Record<string, PortfolioQuoteRow | null>> {
  const metaByYahoo = new Map<
    string,
    { symbolT212: string | null; currency: string | null; brokerPrice: number | null }
  >();
  for (const h of holdings) {
    const k = h.symbolYahoo.trim().toUpperCase();
    if (!k) continue;
    const prev = metaByYahoo.get(k);
    const brokerPrice =
      h.brokerPrice != null && Number.isFinite(h.brokerPrice) && h.brokerPrice > 0
        ? h.brokerPrice
        : null;
    if (!prev) {
      metaByYahoo.set(k, {
        symbolT212: h.symbolT212 ?? null,
        currency: h.currency ?? null,
        brokerPrice,
      });
    } else {
      if (!prev.symbolT212 && h.symbolT212) prev.symbolT212 = h.symbolT212;
      if (!prev.currency && h.currency) prev.currency = h.currency;
      if (brokerPrice != null) prev.brokerPrice = brokerPrice;
    }
  }

  const uniq = [...metaByYahoo.keys()];
  const out: Record<string, PortfolioQuoteRow | null> = Object.fromEntries(uniq.map((s) => [s, null]));

  await Promise.all(
    uniq.map(async (sym) => {
      const meta = metaByYahoo.get(sym)!;
      out[sym] = await fetchOnePortfolioQuote(
        sym,
        meta.symbolT212,
        meta.currency,
        meta.brokerPrice,
        meta.currency,
      );
    }),
  );

  return out;
}

/** @deprecated Prefer {@link fetchPortfolioQuotesForHoldings} so T212 tickers can refine Yahoo resolution. */
export async function fetchPortfolioQuotesForSymbols(
  symbols: string[],
): Promise<Record<string, PortfolioQuoteRow | null>> {
  return fetchPortfolioQuotesForHoldings(symbols.map((symbolYahoo) => ({ symbolYahoo, symbolT212: null })));
}
