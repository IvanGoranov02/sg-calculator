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

/**
 * The free plan caps history at 5 years; asking for more gets the whole request
 * rejected (payment-required error), not a truncated response. 5 annual rows and
 * 20 quarters is exactly what the UI shows anyway.
 */
export const FMP_ANNUAL_LIMIT = 5;
export const FMP_QUARTER_LIMIT = 20;

/** Ring buffer of recent FMP failures (key-redacted) for /api/health diagnostics. */
const recentFailures: string[] = [];
function noteFmpFailure(msg: string): void {
  console.warn(`[fmp] ${msg}`);
  recentFailures.push(`${new Date().toISOString()} ${msg}`);
  if (recentFailures.length > 10) recentFailures.shift();
}
export function fmpRecentFailures(): string[] {
  return [...recentFailures];
}

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
    if (!res.ok) {
      // Never log the key. Plan-limit rejections (402) land here — visible in logs.
      noteFmpFailure(`http ${res.status}: ${url.replace(/apikey=[^&]+/, "apikey=***")}`);
      return null;
    }
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
  const limit = period === "annual" ? FMP_ANNUAL_LIMIT : FMP_QUARTER_LIMIT;
  const s = encodeURIComponent(sym);
  // Stable and legacy bases, each with the plan-safe limit and (as insurance
  // against plan-cap quirks) without a limit param at all.
  const candidates = [
    `${STABLE_BASE}/${kind}?symbol=${s}&period=${period}&limit=${limit}&apikey=${apiKey}`,
    `${V3_BASE}/${kind}/${s}?period=${period}&limit=${limit}&apikey=${apiKey}`,
    `${STABLE_BASE}/${kind}?symbol=${s}&period=${period}&apikey=${apiKey}`,
    `${V3_BASE}/${kind}/${s}?period=${period}&apikey=${apiKey}`,
  ];
  for (const url of candidates) {
    const data = await fetchJsonArray(url);
    if (data) return data;
  }
  return [];
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
