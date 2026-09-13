/**
 * Server-only: batch Yahoo daily closes for portfolio value history.
 */

import type { QuoteHistoryBar } from "@/lib/dipFinder";
import { yahooFinance } from "@/lib/yahooFinanceClient";

const HISTORY_YEARS = 5;

function toIsoDate(d: unknown): string | null {
  if (d == null || d === "") return null;
  const dt = d instanceof Date ? d : new Date(String(d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function mapChartQuotes(quotes: Array<{ date?: Date; close?: number | null }>): QuoteHistoryBar[] {
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

export async function fetchPortfolioQuoteHistory(
  symbols: string[],
): Promise<Record<string, QuoteHistoryBar[]>> {
  const unique = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return {};

  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - HISTORY_YEARS);

  const history: Record<string, QuoteHistoryBar[]> = {};
  await Promise.all(
    unique.map(async (sym) => {
      try {
        history[sym] = await fetchDailyCloses(sym, period1);
      } catch {
        history[sym] = [];
      }
    }),
  );

  return history;
}
