/**
 * Financial Modeling Prep fetch layer. Optional: enabled only when FMP_API_KEY
 * is set (free tier at financialmodelingprep.com works). Tries the current
 * /stable endpoints first and falls back to the legacy /api/v3 shape, so both
 * old and new API keys work.
 */

import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

import { bundleFromFmpStatements, type FmpStatements } from "@/lib/fmp/normalize";

const STABLE_BASE = "https://financialmodelingprep.com/stable";
const V3_BASE = "https://financialmodelingprep.com/api/v3";
const FETCH_TIMEOUT_MS = 20_000;

/** Annual rows beyond the 5y window get trimmed anyway; quarters cover ~6 years. */
const ANNUAL_LIMIT = 7;
const QUARTER_LIMIT = 26;

export function fmpApiKey(): string | null {
  const k = process.env.FMP_API_KEY?.trim();
  return k || null;
}

async function fetchJsonArray(url: string): Promise<unknown[] | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    return Array.isArray(data) && data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

type StatementKind = "income-statement" | "balance-sheet-statement" | "cash-flow-statement";

async function fetchStatement(
  apiKey: string,
  sym: string,
  kind: StatementKind,
  period: "annual" | "quarter",
): Promise<unknown[]> {
  const limit = period === "annual" ? ANNUAL_LIMIT : QUARTER_LIMIT;
  const stable = `${STABLE_BASE}/${kind}?symbol=${encodeURIComponent(sym)}&period=${period}&limit=${limit}&apikey=${apiKey}`;
  const fromStable = await fetchJsonArray(stable);
  if (fromStable) return fromStable;
  const v3 = `${V3_BASE}/${kind}/${encodeURIComponent(sym)}?period=${period}&limit=${limit}&apikey=${apiKey}`;
  return (await fetchJsonArray(v3)) ?? [];
}

/**
 * Fundamentals from FMP, or null when the key is absent, the symbol isn't
 * covered, or the data is too thin — the caller then falls back to EDGAR/Gemini.
 */
export async function fetchStockBundleFromFmp(symbol: string): Promise<StockAnalysisBundle | null> {
  const apiKey = fmpApiKey();
  if (!apiKey) return null;
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;

  try {
    const [incomeAnnual, incomeQuarter, balanceAnnual, balanceQuarter, cashFlowAnnual, cashFlowQuarter] =
      await Promise.all([
        fetchStatement(apiKey, sym, "income-statement", "annual"),
        fetchStatement(apiKey, sym, "income-statement", "quarter"),
        fetchStatement(apiKey, sym, "balance-sheet-statement", "annual"),
        fetchStatement(apiKey, sym, "balance-sheet-statement", "quarter"),
        fetchStatement(apiKey, sym, "cash-flow-statement", "annual"),
        fetchStatement(apiKey, sym, "cash-flow-statement", "quarter"),
      ]);

    const statements: FmpStatements = {
      incomeAnnual,
      incomeQuarter,
      balanceAnnual,
      balanceQuarter,
      cashFlowAnnual,
      cashFlowQuarter,
    };
    return bundleFromFmpStatements(sym, statements);
  } catch {
    return null;
  }
}
