/**
 * Server-only: batch Yahoo quotes + dividend metrics for portfolio rows.
 * Resolves symbols with fallbacks (EU listings, -EQ ETPs) when direct quote fails.
 */

import YahooFinance from "yahoo-finance2";

import { mapInvestorMetrics } from "@/lib/mapInvestorMetrics";

const yahooFinance = new YahooFinance({ suppressNotices: ["ripHistorical"] });

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
  return {
    symbol: portfolioKey,
    resolvedYahooSymbol: resolvedYahoo,
    name: String(raw.longName ?? raw.shortName ?? portfolioKey),
    price,
    currency: metrics.currency,
    dividendYield: metrics.dividendYield,
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

async function fetchOnePortfolioQuote(portfolioSymbol: string): Promise<PortfolioQuoteRow | null> {
  for (const c of buildYahooSymbolCandidates(portfolioSymbol)) {
    const row = await tryQuoteSymbol(portfolioSymbol, c);
    if (row) return row;
  }
  return searchFallbackQuote(portfolioSymbol);
}

export async function fetchPortfolioQuotesForSymbols(
  symbols: string[],
): Promise<Record<string, PortfolioQuoteRow | null>> {
  const uniq = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const out: Record<string, PortfolioQuoteRow | null> = Object.fromEntries(uniq.map((s) => [s, null]));

  await Promise.all(
    uniq.map(async (sym) => {
      out[sym] = await fetchOnePortfolioQuote(sym);
    }),
  );

  return out;
}
