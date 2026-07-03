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

async function fetchJsonArray(url: string): Promise<{ data: unknown[] | null; status: number }> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Never log the key. Plan-limit rejections (402/403) land here — visible in logs.
      noteFmpFailure(`http ${res.status}: ${url.replace(/apikey=[^&]+/, "apikey=***")}`);
      return { data: null, status: res.status };
    }
    const data = (await res.json()) as unknown;
    return { data: Array.isArray(data) && data.length > 0 ? data : null, status: res.status };
  } catch {
    return { data: null, status: 0 };
  }
}

type StatementKind = "income-statement" | "balance-sheet-statement" | "cash-flow-statement";

/**
 * Free plans reject `limit` values above the plan cap outright (402/403) instead
 * of truncating. Remember that per warm instance so subsequent symbols skip the
 * doomed limit-bearing requests — they'd burn 6 quota calls per symbol otherwise.
 */
let planRejectsQuarterLimit = false;

async function fetchStatement(
  apiKey: string,
  sym: string,
  kind: StatementKind,
  period: "annual" | "quarter",
): Promise<unknown[]> {
  const limit = period === "annual" ? FMP_ANNUAL_LIMIT : FMP_QUARTER_LIMIT;
  const s = encodeURIComponent(sym);
  const withLimit = [
    `${STABLE_BASE}/${kind}?symbol=${s}&period=${period}&limit=${limit}&apikey=${apiKey}`,
    `${V3_BASE}/${kind}/${s}?period=${period}&limit=${limit}&apikey=${apiKey}`,
  ];
  const withoutLimit = [
    `${STABLE_BASE}/${kind}?symbol=${s}&period=${period}&apikey=${apiKey}`,
    `${V3_BASE}/${kind}/${s}?period=${period}&apikey=${apiKey}`,
  ];
  const skipLimit = period === "quarter" && planRejectsQuarterLimit;
  const candidates = skipLimit ? withoutLimit : [...withLimit, ...withoutLimit];

  for (const url of candidates) {
    const { data, status } = await fetchJsonArray(url);
    if (data) return data;
    if (period === "quarter" && url.includes("limit=") && (status === 402 || status === 403)) {
      planRejectsQuarterLimit = true;
    }
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
    // Annual income first: the normalizer requires it anyway, and symbols outside
    // the plan's coverage 402 on it — bailing here saves the other ~14 quota calls
    // per uncovered symbol (free plans cover mostly US listings).
    const incomeAnnual = await fetchStatement(apiKey, sym, "income-statement", "annual");
    if (incomeAnnual.length === 0) return null;

    const [incomeQuarter, balanceAnnual, balanceQuarter, cashFlowAnnual, cashFlowQuarter] =
      await Promise.all([
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
