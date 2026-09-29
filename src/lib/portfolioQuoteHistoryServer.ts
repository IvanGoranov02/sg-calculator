/**
 * Server-only: batch Yahoo daily closes for portfolio value history.
 */

import type { QuoteHistoryBar } from "@/lib/dipFinder";
import { normalizeIsoDateString } from "@/lib/format";
import { PORTFOLIO_HISTORY_SYMBOL_CAP } from "@/lib/portfolioValueHistory";
import { yahooFinance } from "@/lib/yahooFinanceClient";

const HISTORY_YEARS = 5;
const MAX_SYMBOLS = PORTFOLIO_HISTORY_SYMBOL_CAP;
const FETCH_CHUNK = 20;

function toIsoDate(d: unknown): string | null {
  if (d == null || d === "") return null;
  if (typeof d === "string") return normalizeIsoDateString(d);
  const dt = d instanceof Date ? d : new Date(String(d));
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  period1?: Date,
): Promise<Record<string, QuoteHistoryBar[]>> {
  const unique = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))].slice(0, MAX_SYMBOLS);
  if (unique.length === 0) return {};

  const from =
    period1 ??
    (() => {
      const d = new Date();
      d.setUTCFullYear(d.getUTCFullYear() - HISTORY_YEARS);
      return d;
    })();

  const history: Record<string, QuoteHistoryBar[]> = {};
  for (let i = 0; i < unique.length; i += FETCH_CHUNK) {
    const chunk = unique.slice(i, i + FETCH_CHUNK);
    await Promise.all(
      chunk.map(async (sym) => {
        try {
          history[sym] = await fetchDailyCloses(sym, from);
        } catch {
          history[sym] = [];
        }
      }),
    );
  }

  return history;
}
