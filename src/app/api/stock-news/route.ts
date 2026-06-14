import { NextResponse } from "next/server";

import { checkRateLimit, clientKeyFromRequest, rateLimitResponse } from "@/lib/rateLimit";
import { fetchMarketNews } from "@/lib/yahooQuickQuote";
import { isValidStockSymbolInput } from "@/lib/stockSymbol";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const key = clientKeyFromRequest(request);
  const limited = checkRateLimit("stock-news", key, 40, 60_000);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") ?? "").trim().toUpperCase();
  const name = (searchParams.get("name") ?? "").trim();
  if (!symbol || !isValidStockSymbolInput(symbol)) {
    return NextResponse.json({ items: [] });
  }

  // Company name yields more on-topic results than the bare ticker when available.
  const query = name ? `${name} ${symbol}` : symbol;
  const items = await fetchMarketNews(query, 8);
  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
