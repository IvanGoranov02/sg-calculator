/**
 * Server-only: lightweight side-by-side metrics for the stock comparison view.
 * Uses quote + quoteSummary (no EDGAR/Gemini pipeline), so comparing several
 * tickers stays fast and cheap.
 */

import YahooFinance from "yahoo-finance2";

import { mapInvestorMetrics } from "@/lib/mapInvestorMetrics";
import type { InvestorMetrics } from "@/lib/stockAnalysisTypes";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export type CompareRow = {
  symbol: string;
  name: string;
  price: number;
  changesPercentage: number;
  investor: InvestorMetrics;
};

async function fetchOne(symbol: string): Promise<CompareRow | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;
  try {
    const [qRaw, qs] = await Promise.all([
      yahooFinance.quote(sym),
      yahooFinance
        .quoteSummary(sym, {
          modules: ["summaryDetail", "financialData", "defaultKeyStatistics", "price"],
        })
        .catch(() => null),
    ]);
    const q = Array.isArray(qRaw) ? qRaw[0] : qRaw;
    if (!q || typeof q !== "object") return null;
    const rec = q as Record<string, unknown>;
    if (rec.quoteType === "NONE") return null;
    const price = Number(rec.regularMarketPrice ?? 0);
    if (!Number.isFinite(price) || price <= 0) return null;
    let pct = Number(rec.regularMarketChangePercent ?? NaN);
    if (!Number.isFinite(pct)) pct = 0;
    return {
      symbol: String(rec.symbol ?? sym).toUpperCase(),
      name: String(rec.longName ?? rec.shortName ?? sym),
      price,
      changesPercentage: pct,
      investor: mapInvestorMetrics(rec, qs as Record<string, unknown> | null),
    };
  } catch {
    return null;
  }
}

export async function fetchCompareRows(symbols: string[]): Promise<CompareRow[]> {
  const uniq = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))).slice(0, 4);
  const rows = await Promise.all(uniq.map(fetchOne));
  return rows.filter((r): r is CompareRow => r !== null);
}
