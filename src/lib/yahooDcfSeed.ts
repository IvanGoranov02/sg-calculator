/** Server-only: the price, trailing EPS and growth used by the EPS calculator. */

import { withTimeout } from "@/lib/asyncTimeout";
import { capGuruFocusGrowthRate } from "@/lib/dcf";
import { mapInvestorMetrics } from "@/lib/mapInvestorMetrics";
import { normalizeQuotePrice, quoteCurrencyMajor } from "@/lib/portfolioFx";
import { yahooFinance } from "@/lib/yahooFinanceClient";

export type DcfSeed = {
  symbol: string;
  name: string;
  /** All per-share amounts use this listing currency in major units. */
  currency: string;
  currentPrice: number;
  /** Trailing / diluted EPS in the same currency as currentPrice. */
  epsPerShare: number;
  /** Suggested EPS growth-stage rate (decimal), capped 5–20%. */
  suggestedEpsGrowthRate: number;
};

type FinRow = { date: Date | string; dilutedEPS?: number };

const REQUEST_TIMEOUT_MS = 5_000;

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function financialCurrency(raw: Record<string, unknown>, qs: Record<string, unknown> | null): string {
  const fd = qs?.financialData as { financialCurrency?: unknown } | undefined;
  const value = raw.financialCurrency ?? fd?.financialCurrency;
  return quoteCurrencyMajor(typeof value === "string" ? value : "").code;
}

/** Use elapsed years rather than row count: Yahoo may omit a financial year. */
export function epsGrowthFromHistory(rows: FinRow[]): number | null {
  const points = rows.map((r) => ({ t: new Date(r.date).getTime(), eps: finiteNumber(r.dilutedEPS) }))
    .filter((r) => Number.isFinite(r.t) && r.eps != null && r.eps > 0)
    .sort((a, b) => a.t - b.t).slice(-11);
  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end || start === end) return null;
  const years = (end.t - start.t) / (365.25 * 86_400_000);
  if (years < 0.5) return null;
  const rate = (end.eps! / start.eps!) ** (1 / years) - 1;
  return Number.isFinite(rate) ? rate : null;
}

/**
 * Yahoo earnings use the financial reporting currency, while prices may use a
 * different listing currency or pence. Missing required FX leaves the seed
 * unavailable instead of presenting a fabricated P/E or fair value.
 */
export function buildDcfSeed(
  symbol: string,
  raw: Record<string, unknown>,
  qs: Record<string, unknown> | null,
  finRows: FinRow[],
  quotePerFinancial: number | null = null,
): DcfSeed | null {
  if (raw.quoteType === "NONE") return null;
  const investor = mapInvestorMetrics(raw, qs);
  const rawPrice = finiteNumber(raw.regularMarketPrice);
  if (rawPrice == null || rawPrice <= 0) return null;
  const rawCurrency = typeof raw.currency === "string" ? raw.currency : investor.currency;
  const normalized = normalizeQuotePrice(rawPrice, rawCurrency);
  const reporting = financialCurrency(raw, qs);
  const needsFx = reporting && reporting !== normalized.currency;
  if (needsFx && (quotePerFinancial == null || !Number.isFinite(quotePerFinancial) || quotePerFinancial <= 0)) return null;
  const fx = needsFx ? quotePerFinancial! : 1;
  const sorted = finRows.filter((r) => Number.isFinite(new Date(r.date).getTime()))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const latestEps = finiteNumber(sorted[sorted.length - 1]?.dilutedEPS);
  const nativeEps = investor.trailingEps ?? latestEps ?? 0;
  const epsPerShare = nativeEps * fx;
  const historicGrowth = epsGrowthFromHistory(sorted);
  const fallbackGrowth = investor.earningsGrowth ?? 0.1;
  return {
    symbol: String(raw.symbol ?? symbol).toUpperCase(),
    name: String(raw.longName ?? raw.shortName ?? symbol),
    currency: normalized.currency,
    currentPrice: normalized.price,
    epsPerShare,
    suggestedEpsGrowthRate: capGuruFocusGrowthRate(historicGrowth ?? fallbackGrowth),
  };
}

export async function fetchDcfSeed(symbol: string): Promise<DcfSeed | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;
  const moduleOptions = { fetchOptions: { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) } };
  try {
    // Cash-flow and balance-sheet calls used to delay or fail this EPS-only
    // screen. EPS history is optional; a quote with TTM EPS remains usable.
    const [qRaw, qsRaw, finRaw] = await Promise.all([
      withTimeout(yahooFinance.quote(sym, {}, moduleOptions), REQUEST_TIMEOUT_MS, `DCF quote ${sym}`),
      withTimeout(yahooFinance.quoteSummary(sym, {
        modules: ["summaryDetail", "financialData", "defaultKeyStatistics", "price"],
      }, moduleOptions), REQUEST_TIMEOUT_MS, `DCF summary ${sym}`).catch(() => null),
      withTimeout(yahooFinance.fundamentalsTimeSeries(sym, {
        period1: "2010-01-01", period2: new Date().toISOString().slice(0, 10),
        type: "annual", module: "financials",
      }, moduleOptions), REQUEST_TIMEOUT_MS, `DCF EPS history ${sym}`).catch(() => []),
    ]);
    const q = Array.isArray(qRaw) ? qRaw[0] : qRaw;
    if (!q || typeof q !== "object") return null;
    const raw = q as Record<string, unknown>;
    const qs = qsRaw as Record<string, unknown> | null;
    const quoteCcy = quoteCurrencyMajor(typeof raw.currency === "string" ? raw.currency : mapInvestorMetrics(raw, qs).currency).code;
    const reporting = financialCurrency(raw, qs);
    let quotePerFinancial: number | null = 1;
    if (reporting && quoteCcy && reporting !== quoteCcy) {
      const pair = `${reporting}${quoteCcy}=X`;
      const fxOptions = { fetchOptions: { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) } };
      const fxRaw = await withTimeout(yahooFinance.quote(pair, {}, fxOptions), REQUEST_TIMEOUT_MS, `DCF FX ${pair}`).catch(() => null);
      const fxQuote = Array.isArray(fxRaw) ? fxRaw[0] : fxRaw;
      quotePerFinancial = finiteNumber((fxQuote as { regularMarketPrice?: unknown } | null)?.regularMarketPrice);
    }
    return buildDcfSeed(sym, raw, qs, Array.isArray(finRaw) ? finRaw as FinRow[] : [], quotePerFinancial);
  } catch {
    return null;
  }
}
