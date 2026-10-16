import YahooFinance from "yahoo-finance2";
import { NextResponse } from "next/server";

import type { WatchlistQuoteRow } from "@/lib/watchlistTypes";
import { WATCHLIST_MAX } from "@/lib/watchlistStorage";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function num(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapQuoteRow(symbol: string, q: Record<string, unknown>): WatchlistQuoteRow | null {
  if ((q.quoteType as string | undefined) === "NONE") return null;
  const price = Number(q.regularMarketPrice ?? 0);
  const change = Number(q.regularMarketChange ?? 0);
  let pct = Number(q.regularMarketChangePercent ?? NaN);
  if (!Number.isFinite(pct)) {
    const prev = price - change;
    pct = prev !== 0 ? (change / prev) * 100 : 0;
  }
  const sma = num(q.twoHundredDayAverage);
  let dipVsSma200Pct: number | null = null;
  if (sma != null && sma !== 0 && Number.isFinite(price)) {
    dipVsSma200Pct = ((price - sma) / sma) * 100;
  }
  return {
    symbol: String(q.symbol ?? symbol).toUpperCase(),
    name: String(q.longName ?? q.shortName ?? symbol),
    price,
    change,
    changesPercentage: Number.isFinite(pct) ? pct : 0,
    twoHundredDayAverage: sma,
    dipVsSma200Pct,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("symbols") ?? "";
  const symbols = Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z0-9.\-^]+$/.test(s)),
    ),
  ).slice(0, WATCHLIST_MAX);

  if (symbols.length === 0) {
    return NextResponse.json({ quotes: [] satisfies WatchlistQuoteRow[] });
  }

  try {
    const result = await yahooFinance.quote(symbols);
    const arr = Array.isArray(result) ? result : [result];
    const quotes: WatchlistQuoteRow[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const q = item as Record<string, unknown>;
      const sym = String(q.symbol ?? "").toUpperCase();
      if (!sym) continue;
      const row = mapQuoteRow(sym, q);
      if (row) quotes.push(row);
    }
    return NextResponse.json({ quotes });
  } catch {
    return NextResponse.json({ error: "Could not load quotes." }, { status: 502 });
  }
}
