/**
 * Server-only: single-symbol quote for dashboard teasers.
 */

import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export type QuickQuote = {
  symbol: string;
  name: string;
  price: number;
  changesPercentage: number;
  marketState?: string | null;
  exchange?: string | null;
  regularMarketTime?: string | null;
};

export async function fetchQuickQuote(symbol: string): Promise<QuickQuote | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;
  try {
    const raw = await yahooFinance.quote(sym);
    const q = Array.isArray(raw) ? raw[0] : raw;
    if (!q || typeof q !== "object") return null;
    const rec = q as Record<string, unknown>;
    if (rec.quoteType === "NONE") return null;
    const price = Number(rec.regularMarketPrice ?? 0);
    const change = Number(rec.regularMarketChange ?? 0);
    let pct = Number(rec.regularMarketChangePercent ?? NaN);
    if (!Number.isFinite(pct)) {
      const prev = price - change;
      pct = prev !== 0 ? (change / prev) * 100 : 0;
    }
    return {
      symbol: String(rec.symbol ?? sym).toUpperCase(),
      name: String(rec.longName ?? rec.shortName ?? sym),
      price,
      changesPercentage: Number.isFinite(pct) ? pct : 0,
      marketState: typeof rec.marketState === "string" ? rec.marketState : null,
      exchange: typeof rec.fullExchangeName === "string" ? rec.fullExchangeName : null,
      regularMarketTime:
        rec.regularMarketTime instanceof Date
          ? rec.regularMarketTime.toISOString()
          : typeof rec.regularMarketTime === "string"
            ? rec.regularMarketTime
            : null,
    };
  } catch {
    return null;
  }
}

export type MarketNewsItem = {
  title: string;
  publisher: string | null;
  link: string;
  publishedAt: string | null;
};

export async function fetchMarketNews(query: string, limit = 3): Promise<MarketNewsItem[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const result = await yahooFinance.search(q, { quotesCount: 0, newsCount: limit });
    const news = Array.isArray(result.news) ? result.news : [];
    return news
      .map((item: unknown): MarketNewsItem | null => {
        if (!item || typeof item !== "object") return null;
        const rec = item as Record<string, unknown>;
        const title = typeof rec.title === "string" ? rec.title.trim() : "";
        const link = typeof rec.link === "string" ? rec.link.trim() : "";
        if (!title || !link) return null;
        const providerPublishTime = Number(rec.providerPublishTime);
        return {
          title,
          publisher: typeof rec.publisher === "string" ? rec.publisher : null,
          link,
          publishedAt: Number.isFinite(providerPublishTime)
            ? new Date(providerPublishTime * 1000).toISOString()
            : null,
        };
      })
      .filter((item): item is MarketNewsItem => item !== null)
      .slice(0, limit);
  } catch {
    return [];
  }
}
