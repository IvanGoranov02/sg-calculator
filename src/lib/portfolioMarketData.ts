/**
 * Server-only: batch Yahoo quotes + dividend metrics for portfolio rows.
 * Order: stored symbolYahoo → T212-mapped ticker → EU/ETP suffix fallbacks → Yahoo search.
 */

import YahooFinance from "yahoo-finance2";

import { mapInvestorMetrics } from "@/lib/mapInvestorMetrics";
import { normalizeYahooDividendYieldToDecimal } from "@/lib/format";
import { t212TickerToYahoo } from "@/lib/t212Ticker";

const yahooFinance = new YahooFinance({
  suppressNotices: ["ripHistorical", "yahooSurvey"],
});

export type PortfolioQuoteRow = {
  symbol: string;
  /** Yahoo symbol used to fetch this row (may differ from portfolio key, e.g. AMZD-EQ → AMZD.DE). */
  resolvedYahooSymbol?: string;
  name: string;
  price: number;
  currency: string;
  dividendYield: number | null;
  dividendRate: number | null;
  changePercent: number;
};

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
    // T212 EU stubs often add a trailing "A" (e.g. ASMLA-EQ → ASML on AMS).
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

/** Try Yahoo in a stable order: UI symbol → broker mapping → heuristics. */
function buildOrderedCandidates(symbolYahoo: string, symbolT212: string | null): string[] {
  const u = symbolYahoo.trim().toUpperCase();
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (s: string) => {
    const x = s.trim().toUpperCase();
    if (!x || seen.has(x)) return;
    seen.add(x);
    out.push(x);
  };

  push(u);
  if (symbolT212) {
    const mapped = t212TickerToYahoo(symbolT212).trim().toUpperCase();
    if (mapped) push(mapped);
  }
  for (const c of buildYahooSymbolCandidates(u)) {
    push(c);
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
  const price = Number(raw.regularMarketPrice ?? 0);
  if (!Number.isFinite(price) || price <= 0) return null;

  const metrics = mapInvestorMetrics(raw, qs);
  const pct = Number(raw.regularMarketChangePercent ?? 0);
  const yieldDec = normalizeYahooDividendYieldToDecimal(metrics.dividendYield);
  return {
    symbol: portfolioKey,
    resolvedYahooSymbol: resolvedYahoo,
    name: String(raw.longName ?? raw.shortName ?? portfolioKey),
    price,
    currency: metrics.currency,
    dividendYield: yieldDec,
    dividendRate: metrics.dividendRate,
    changePercent: Number.isFinite(pct) ? pct : 0,
  };
}

async function tryQuoteSymbol(portfolioKey: string, yahooSym: string): Promise<PortfolioQuoteRow | null> {
  try {
    const [q, qs] = await Promise.all([
      yahooFinance.quote(yahooSym),
      yahooFinance
        .quoteSummary(yahooSym, {
          modules: ["summaryDetail", "financialData", "defaultKeyStatistics", "price"],
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

async function searchFallbackQuote(portfolioKey: string): Promise<PortfolioQuoteRow | null> {
  const stripped = portfolioKey.replace(/-EQ$/i, "").replace(/-/g, " ");
  const query = stripped.trim() || portfolioKey;
  try {
    const r = await yahooFinance.search(query, { quotesCount: 14, newsCount: 0 });
    const quotes = r.quotes ?? [];
    for (const hit of quotes) {
      if (typeof hit !== "object" || hit === null || !("symbol" in hit)) continue;
      const h = hit as { symbol?: string; quoteType?: string };
      const sym = typeof h.symbol === "string" ? h.symbol : "";
      if (!sym) continue;
      const qt = h.quoteType ?? "";
      if (qt !== "EQUITY" && qt !== "ETF" && qt !== "MUTUALFUND") continue;
      const row = await tryQuoteSymbol(portfolioKey, sym);
      if (row) return row;
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchOnePortfolioQuote(
  portfolioSymbol: string,
  symbolT212: string | null,
): Promise<PortfolioQuoteRow | null> {
  for (const c of buildOrderedCandidates(portfolioSymbol, symbolT212)) {
    const row = await tryQuoteSymbol(portfolioSymbol, c);
    if (row) return row;
  }
  return searchFallbackQuote(portfolioSymbol);
}

export type PortfolioHoldingQuoteKey = {
  symbolYahoo: string;
  symbolT212: string | null;
};

export async function fetchPortfolioQuotesForHoldings(
  holdings: PortfolioHoldingQuoteKey[],
): Promise<Record<string, PortfolioQuoteRow | null>> {
  const t212ByYahoo = new Map<string, string | null>();
  for (const h of holdings) {
    const k = h.symbolYahoo.trim().toUpperCase();
    if (!k) continue;
    if (!t212ByYahoo.has(k)) t212ByYahoo.set(k, h.symbolT212 ?? null);
    else if (!t212ByYahoo.get(k) && h.symbolT212) t212ByYahoo.set(k, h.symbolT212);
  }

  const uniq = [...t212ByYahoo.keys()];
  const out: Record<string, PortfolioQuoteRow | null> = Object.fromEntries(uniq.map((s) => [s, null]));

  await Promise.all(
    uniq.map(async (sym) => {
      out[sym] = await fetchOnePortfolioQuote(sym, t212ByYahoo.get(sym) ?? null);
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
