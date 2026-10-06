import YahooFinance from "yahoo-finance2";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { extractSymbolEventRow, type SymbolEventRow } from "@/lib/calendarEvents";
import {
  EVENTS_SERVER_MAX_AGE_SEC,
  privateTtlCacheControl,
  requestWantsRefresh,
} from "@/lib/apiCacheHeaders";
import { checkRateLimit, clientKeyFromRequest, rateLimitResponse } from "@/lib/rateLimit";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const dynamic = "force-dynamic";

const MAX_SYMBOLS = 80;

async function fetchOne(symbol: string): Promise<SymbolEventRow | null> {
  try {
    const qs = await yahooFinance.quoteSummary(symbol, {
      modules: ["calendarEvents", "price"],
    });
    const price = (qs as { price?: { longName?: string; shortName?: string } }).price;
    const name = String(price?.longName ?? price?.shortName ?? symbol);
    return extractSymbolEventRow(qs, symbol, name);
  } catch {
    return null;
  }
}

/** Shared Yahoo calendar row per symbol — 24h across users. */
async function fetchOneCached(symbol: string): Promise<SymbolEventRow | null> {
  return unstable_cache(
    async () => fetchOne(symbol),
    ["events-calendar-symbol", symbol],
    { revalidate: EVENTS_SERVER_MAX_AGE_SEC },
  )();
}

export async function GET(request: Request) {
  const key = clientKeyFromRequest(request);
  const limited = checkRateLimit("events", key, 30, 60_000);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  const refresh = requestWantsRefresh(request.url);
  const { searchParams } = new URL(request.url);
  const symbols = Array.from(
    new Set(
      (searchParams.get("symbols") ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z0-9.\-^]+$/.test(s)),
    ),
  ).slice(0, MAX_SYMBOLS);

  const cacheHeaders = {
    "Cache-Control": privateTtlCacheControl(EVENTS_SERVER_MAX_AGE_SEC, refresh),
  };

  if (symbols.length === 0) {
    return NextResponse.json({ rows: [] satisfies SymbolEventRow[] }, { headers: cacheHeaders });
  }

  const load = refresh ? fetchOne : fetchOneCached;
  const settled = await Promise.all(symbols.map((symbol) => load(symbol)));
  const rows = settled.filter((r): r is SymbolEventRow => r !== null);
  return NextResponse.json({ rows }, { headers: cacheHeaders });
}

export type { SymbolEventRow };
