import { NextResponse } from "next/server";

import { checkRateLimit, clientKeyFromRequest, rateLimitResponse } from "@/lib/rateLimit";
import { fetchMarketNews } from "@/lib/yahooQuickQuote";
import { isValidStockSymbolInput } from "@/lib/stockSymbol";
import { createSharedRequestCache, RequestCapacityError } from "@/lib/sharedRequestCache";
import { isTimeoutError } from "@/lib/asyncTimeout";
import type { MarketNewsItem } from "@/lib/marketNews";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const loadNews = createSharedRequestCache<MarketNewsItem[]>({ ttlMs: 300_000, timeoutMs: 20_000 });

export async function GET(request: Request) {
  const key = clientKeyFromRequest(request);
  const limited = checkRateLimit("stock-news", key, 40, 60_000);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") ?? "").trim().toUpperCase();
  const name = (searchParams.get("name") ?? "").trim().slice(0, 200);
  if (!symbol || !isValidStockSymbolInput(symbol)) {
    return NextResponse.json({ items: [] });
  }

  // Company name yields more on-topic results than the bare ticker when available.
  const query = name ? `${name} ${symbol}` : symbol;
  try {
    const items = await loadNews(query, () => fetchMarketNews(query, 8, { throwOnError: true }));
    return NextResponse.json({ items }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (error) {
    const status = error instanceof RequestCapacityError ? 503 : isTimeoutError(error) ? 504 : 502;
    return NextResponse.json({ error: "Could not load news. Try again." }, { status });
  }
}
