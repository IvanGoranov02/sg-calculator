/**
 * Server-only: single-symbol quote for dashboard teasers.
 */

import { yahooFinance } from "@/lib/yahooFinanceClient";

export type QuickQuote = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changesPercentage: number;
  marketState?: string | null;
  exchange?: string | null;
  regularMarketTime?: string | null;
};

export type SparkQuote = QuickQuote & { sparkline: number[] };

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
      change: Number.isFinite(change) ? change : 0,
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

const SPARKLINE_TTL_MS = 5 * 60_000;
const sparklineCache = new Map<string, { at: number; points: number[] }>();

export async function fetchSparkline(symbol: string, days = 180): Promise<number[]> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return [];
  const cacheKey = `${sym}:${days}`;
  const cached = sparklineCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SPARKLINE_TTL_MS) return cached.points;
  try {
    const period1 = new Date(Date.now() - days * 86_400_000);
    const chart = await yahooFinance
      .chart(sym, {
        period1,
        interval: "1d",
        return: "array",
      })
      .catch(() => null);
    if (!chart || typeof chart !== "object" || !("quotes" in chart)) return [];
    const quotes = (chart as { quotes: Array<{ close?: number | null }> }).quotes ?? [];
    const out: number[] = [];
    for (const bar of quotes) {
      const close = bar?.close != null ? Number(bar.close) : NaN;
      if (Number.isFinite(close)) out.push(close);
    }
    sparklineCache.set(cacheKey, { at: Date.now(), points: out });
    return out;
  } catch {
    return [];
  }
}

export async function fetchSparkQuote(symbol: string): Promise<SparkQuote | null> {
  const [quote, sparkline] = await Promise.all([fetchQuickQuote(symbol), fetchSparkline(symbol)]);
  if (!quote) return null;
  return { ...quote, sparkline };
}

export type MarketNewsItem = {
  title: string;
  publisher: string | null;
  link: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
};

function pickThumbnail(rec: Record<string, unknown>): string | null {
  const thumb = rec.thumbnail;
  if (!thumb || typeof thumb !== "object") return null;
  const resolutions = (thumb as { resolutions?: unknown }).resolutions;
  if (!Array.isArray(resolutions) || resolutions.length === 0) return null;
  let best: { url: string; width: number } | null = null;
  for (const item of resolutions) {
    if (!item || typeof item !== "object") continue;
    const row = item as { url?: unknown; width?: unknown };
    const url = typeof row.url === "string" ? row.url.trim() : "";
    if (!url) continue;
    const width = Number(row.width);
    const w = Number.isFinite(width) ? width : 0;
    if (!best || Math.abs(w - 240) < Math.abs(best.width - 240)) {
      best = { url, width: w };
    }
  }
  return best?.url ?? null;
}

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
          thumbnailUrl: pickThumbnail(rec),
        };
      })
      .filter((item): item is MarketNewsItem => item !== null)
      .slice(0, limit);
  } catch {
    return [];
  }
}
