import { NextResponse } from "next/server";

import { dipRangeFetchCalendarDays, type QuoteHistoryBar } from "@/lib/dipFinder";
import { WATCHLIST_MAX } from "@/lib/watchlistStorage";
import { yahooFinance } from "@/lib/yahooFinanceClient";

function toIsoDate(d: unknown): string | null {
  if (d == null || d === "") return null;
  const dt = d instanceof Date ? d : new Date(String(d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function mapChartQuotes(
  quotes: Array<{ date?: Date; close?: number | null }>,
): QuoteHistoryBar[] {
  const out: QuoteHistoryBar[] = [];
  for (const q of quotes ?? []) {
    const date = toIsoDate(q?.date);
    const close = q?.close != null ? Number(q.close) : NaN;
    if (!date || !Number.isFinite(close)) continue;
    out.push({ date, close });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

async function fetchDailyCloses(symbol: string, period1: Date): Promise<QuoteHistoryBar[]> {
  const chartDaily = await yahooFinance
    .chart(symbol, {
      period1,
      interval: "1d",
      return: "array",
    })
    .catch(() => null);

  if (chartDaily && typeof chartDaily === "object" && "quotes" in chartDaily) {
    const quotes = (chartDaily as { quotes: Array<{ date?: Date; close?: number | null }> }).quotes;
    const bars = mapChartQuotes(quotes ?? []);
    if (bars.length > 0) return bars;
  }

  const historical = await yahooFinance
    .historical(symbol, {
      period1,
      interval: "1d",
    })
    .catch(() => []);

  const histArr = Array.isArray(historical) ? historical : [];
  return mapChartQuotes(
    histArr.map((h) => ({
      date: (h as { date?: Date }).date,
      close: (h as { close?: number | null }).close,
    })),
  );
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
    return NextResponse.json({ history: {} as Record<string, QuoteHistoryBar[]> });
  }

  // Enough calendar days for a 1y SMA window (252 trading days).
  const period1 = new Date(Date.now() - dipRangeFetchCalendarDays("1y") * 86_400_000);
  const history: Record<string, QuoteHistoryBar[]> = {};

  await Promise.all(
    symbols.map(async (sym) => {
      try {
        history[sym] = await fetchDailyCloses(sym, period1);
      } catch {
        history[sym] = [];
      }
    }),
  );

  return NextResponse.json({ history });
}
