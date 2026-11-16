/**
 * Server-only: lightweight side-by-side metrics for the two-stock comparison view.
 * Uses quote + quoteSummary (no EDGAR/Gemini pipeline), so a pair of tickers stays fast.
 */

import { compareFetchSymbols } from "@/lib/compareMetrics";
import { mapInvestorMetrics } from "@/lib/mapInvestorMetrics";
import type { InvestorMetrics } from "@/lib/stockAnalysisTypes";
import { withTimeoutFallback } from "@/lib/asyncTimeout";
import { readPeriodsMany } from "@/lib/verified/periodStore";
import { ttmMetricsFromRows } from "@/lib/verified/storeViews";
import { yahooFinance } from "@/lib/yahooFinanceClient";

export type CompareRow = {
  symbol: string;
  name: string;
  price: number;
  changesPercentage: number;
  sector: string | null;
  industry: string | null;
  /** 52-week price change in percent points (same unit as `changesPercentage`). */
  weekChangePercent: number | null;
  investor: InvestorMetrics;
};

function strField(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function numField(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchOne(symbol: string): Promise<CompareRow | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;
  try {
    const [qRaw, qs] = await Promise.all([
      yahooFinance.quote(sym),
      yahooFinance
        .quoteSummary(sym, {
          modules: ["summaryDetail", "financialData", "defaultKeyStatistics", "price", "assetProfile"],
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

    const profile = ((qs as Record<string, unknown> | null)?.assetProfile ?? null) as Record<string, unknown> | null;
    const priceMod = ((qs as Record<string, unknown> | null)?.price ?? null) as Record<string, unknown> | null;

    return {
      // Keep the requested symbol so client lookup/order stays stable even when
      // Yahoo normalizes it (e.g. BRK.B → BRK-B), otherwise the row gets dropped.
      symbol: sym,
      name: String(rec.longName ?? rec.shortName ?? priceMod?.longName ?? priceMod?.shortName ?? sym),
      price,
      changesPercentage: pct,
      sector: strField(profile?.sector) ?? strField(rec.sector),
      industry: strField(profile?.industry) ?? strField(rec.industry),
      weekChangePercent:
        numField(rec.fiftyTwoWeekChangePercent) ?? numField(priceMod?.fiftyTwoWeekChangePercent),
      investor: mapInvestorMetrics(rec, qs as Record<string, unknown> | null),
    };
  } catch {
    return null;
  }
}

export async function fetchCompareRows(symbols: string[]): Promise<CompareRow[]> {
  const uniq = compareFetchSymbols(symbols);
  // Stored statements (one query for all symbols) so margins, returns and growth match the
    // stock page. Companies the store does not hold keep the live figures.
    const storedPromise = withTimeoutFallback(readPeriodsMany(uniq), 4_000, "compare store read", null).catch(() => null);
  const rows = (await Promise.all(uniq.map(fetchOne))).filter((r): r is CompareRow => r !== null);
  const stored = await storedPromise;
  if (stored) {
    for (const row of rows) {
      const periods = stored.get(row.symbol);
      const ttm = periods ? ttmMetricsFromRows(periods) : null;
      if (!ttm) continue;
      for (const [key, value] of Object.entries(ttm) as [keyof typeof ttm, number | null][]) {
        if (value != null) row.investor[key] = value;
      }
    }
  }
  return rows;
}
