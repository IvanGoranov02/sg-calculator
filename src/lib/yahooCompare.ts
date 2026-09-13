/**
 * Server-only: lightweight side-by-side metrics for the stock comparison view.
 * Uses quote + quoteSummary (no EDGAR/Gemini pipeline), so comparing several
 * tickers stays fast and cheap.
 */

import { mapInvestorMetrics } from "@/lib/mapInvestorMetrics";
import type { InvestorMetrics } from "@/lib/stockAnalysisTypes";
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
  const uniq = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))).slice(0, 4);
  const rows = await Promise.all(uniq.map(fetchOne));
  return rows.filter((r): r is CompareRow => r !== null);
}
