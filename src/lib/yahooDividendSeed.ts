/**
 * Server-only: seed the dividend growth calculator from Yahoo — current price,
 * annual dividend per share, yield, and a historical dividend CAGR when derivable.
 */

import YahooFinance from "yahoo-finance2";

import { normalizeYahooDividendYieldToDecimal } from "@/lib/format";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

export type DividendSeed = {
  symbol: string;
  name: string;
  currentPrice: number;
  /** Annual dividend per share (forward rate when available, else trailing). */
  annualDividendPerShare: number;
  /** Dividend yield as a decimal fraction (0.025 = 2.5%). */
  dividendYield: number | null;
  /** Suggested annual dividend growth %, derived from history or a sane default. */
  suggestedGrowthPct: number;
  /** True when the suggested growth came from real dividend history. */
  growthFromHistory: boolean;
};

const DEFAULT_GROWTH_PCT = 6;

type DividendEvent = { date?: Date | number | string; amount?: number };

/** Annual dividend CAGR (decimal) from per-payment dividend history, or null. */
function dividendCagrFromEvents(events: DividendEvent[]): number | null {
  const byYear = new Map<number, number>();
  for (const e of events) {
    const amt = Number(e?.amount);
    if (!Number.isFinite(amt) || amt <= 0 || e?.date == null) continue;
    const d = e.date instanceof Date ? e.date : new Date(e.date as string | number);
    if (Number.isNaN(d.getTime())) continue;
    const y = d.getUTCFullYear();
    byYear.set(y, (byYear.get(y) ?? 0) + amt);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  if (years.length < 3) return null;
  // Use complete years only (drop the current, partial year).
  const nowYear = new Date().getUTCFullYear();
  const complete = years.filter((y) => y < nowYear);
  if (complete.length < 3) return null;

  const first = complete[0];
  const last = complete[complete.length - 1];
  const v0 = byYear.get(first)!;
  const v1 = byYear.get(last)!;
  const span = last - first;
  if (v0 <= 0 || v1 <= 0 || span <= 0) return null;
  const cagr = (v1 / v0) ** (1 / span) - 1;
  if (!Number.isFinite(cagr)) return null;
  // Keep within a believable band.
  return Math.max(-0.1, Math.min(0.3, cagr));
}

export async function fetchDividendSeed(symbol: string): Promise<DividendSeed | null> {
  const sym = symbol.trim().toUpperCase();
  const period2 = new Date();
  const period1 = new Date(period2);
  period1.setUTCFullYear(period1.getUTCFullYear() - 8);

  try {
    const [qRaw, chartRaw] = await Promise.all([
      yahooFinance.quote(sym),
      yahooFinance
        .chart(sym, { period1, period2, interval: "1mo", events: "dividends" })
        .catch(() => null),
    ]);

    const q = Array.isArray(qRaw) ? qRaw[0] : qRaw;
    if (!q || (q as { quoteType?: string }).quoteType === "NONE") return null;

    const qr = q as {
      symbol?: string;
      shortName?: string;
      longName?: string;
      regularMarketPrice?: number;
      dividendRate?: number;
      trailingAnnualDividendRate?: number;
      dividendYield?: number;
      trailingAnnualDividendYield?: number;
    };

    const price = Number(qr.regularMarketPrice ?? 0);
    if (!Number.isFinite(price) || price <= 0) return null;

    const dps = Number(
      Number.isFinite(Number(qr.dividendRate)) && Number(qr.dividendRate) > 0
        ? qr.dividendRate
        : (qr.trailingAnnualDividendRate ?? 0),
    );
    const yieldDec = normalizeYahooDividendYieldToDecimal(
      qr.dividendYield ?? qr.trailingAnnualDividendYield ?? null,
    );

    let events: DividendEvent[] = [];
    const ev = (chartRaw as { events?: { dividends?: unknown } } | null)?.events?.dividends;
    if (Array.isArray(ev)) events = ev as DividendEvent[];
    else if (ev && typeof ev === "object") events = Object.values(ev) as DividendEvent[];

    const cagr = dividendCagrFromEvents(events);

    return {
      symbol: (qr.symbol ?? sym).toUpperCase(),
      name: String(qr.longName ?? qr.shortName ?? sym),
      currentPrice: price,
      annualDividendPerShare: Number.isFinite(dps) && dps > 0 ? dps : 0,
      dividendYield: yieldDec,
      suggestedGrowthPct: cagr != null ? Number((cagr * 100).toFixed(1)) : DEFAULT_GROWTH_PCT,
      growthFromHistory: cagr != null,
    };
  } catch {
    return null;
  }
}
