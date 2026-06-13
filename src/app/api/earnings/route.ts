import YahooFinance from "yahoo-finance2";
import { NextResponse } from "next/server";

import { checkRateLimit, clientKeyFromRequest, rateLimitResponse } from "@/lib/rateLimit";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const dynamic = "force-dynamic";

const MAX_SYMBOLS = 60;

export type EarningsRow = {
  symbol: string;
  name: string;
  /** Next (or most recent) earnings date, ISO yyyy-mm-dd. */
  earningsDate: string | null;
};

/** Next upcoming earnings date from a quoteSummary calendarEvents block. */
function nextEarnings(qs: unknown): string | null {
  const ce = (qs as { calendarEvents?: { earnings?: { earningsDate?: Array<Date | string> } } })
    ?.calendarEvents?.earnings?.earningsDate;
  if (!Array.isArray(ce) || ce.length === 0) return null;
  const parsed = ce
    .map((x) => (x instanceof Date ? x : new Date(x)))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (parsed.length === 0) return null;
  const t0 = Date.now() - 86_400_000;
  const upcoming = parsed.filter((d) => d.getTime() >= t0).sort((a, b) => a.getTime() - b.getTime());
  return (upcoming[0] ?? parsed[parsed.length - 1]).toISOString().slice(0, 10);
}

async function fetchOne(symbol: string): Promise<EarningsRow | null> {
  try {
    const qs = await yahooFinance.quoteSummary(symbol, {
      modules: ["calendarEvents", "price"],
    });
    const price = (qs as { price?: { longName?: string; shortName?: string } }).price;
    return {
      symbol,
      name: String(price?.longName ?? price?.shortName ?? symbol),
      earningsDate: nextEarnings(qs),
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const key = clientKeyFromRequest(request);
  const limited = checkRateLimit("earnings", key, 30, 60_000);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  const { searchParams } = new URL(request.url);
  const symbols = Array.from(
    new Set(
      (searchParams.get("symbols") ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z0-9.\-^]+$/.test(s)),
    ),
  ).slice(0, MAX_SYMBOLS);

  if (symbols.length === 0) return NextResponse.json({ rows: [] satisfies EarningsRow[] });

  const settled = await Promise.all(symbols.map(fetchOne));
  const rows = settled.filter((r): r is EarningsRow => r !== null);
  return NextResponse.json({ rows });
}
