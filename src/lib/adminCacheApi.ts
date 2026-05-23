import type { AdminEditableBundle } from "@/lib/adminCacheSchema";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import type { CachePayload } from "@/lib/stockCache";

export function payloadToEditableBundle(payload: unknown): AdminEditableBundle | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as StockAnalysisBundle;
  if (!p.quote || !p.investor) return null;
  return {
    quote: p.quote,
    income: p.income ?? [],
    cashFlow: p.cashFlow ?? [],
    balanceSheet: p.balanceSheet ?? [],
    incomeQuarterly: p.incomeQuarterly ?? [],
    cashFlowQuarterly: p.cashFlowQuarterly ?? [],
    balanceSheetQuarterly: p.balanceSheetQuarterly ?? [],
    dividendQuarterly: p.dividendQuarterly ?? [],
    investor: p.investor,
  };
}

export function editableToStockBundle(edited: AdminEditableBundle): StockAnalysisBundle {
  return {
    ...edited,
    historical: [],
    intraday: undefined,
    eurPerUsd: undefined,
  };
}

export function readQuoteName(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const q = (payload as { quote?: { name?: string } }).quote;
  return q?.name?.trim() || null;
}

export function asCachePayload(payload: unknown): CachePayload | null {
  if (!payload || typeof payload !== "object") return null;
  return payload as CachePayload;
}
