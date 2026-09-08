/**
 * Server-only: snapshot metrics + per-share bases for GuruFocus-style DCF from Yahoo Finance.
 */

import YahooFinance from "yahoo-finance2";

import { capGuruFocusGrowthRate } from "@/lib/dcf";
import { mapInvestorMetrics } from "@/lib/mapInvestorMetrics";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export type DcfSeed = {
  symbol: string;
  name: string;
  currentPrice: number;
  /** Latest annual revenue (USD) */
  revenue: number;
  /** Operating margin % if derivable */
  operatingMarginPct: number | null;
  /** Net income (profit), latest annual */
  netIncome: number;
  /** EBITDA latest annual, if reported */
  ebitda: number | null;
  /** Free cash flow — Yahoo cash-flow line (OCF − capex style) */
  baseFcf: number;
  sharesOutstanding: number;
  netDebt: number;
  /** E₀: trailing / diluted EPS (not NI ÷ shares). */
  epsPerShare: number;
  /** FCF per share (may be negative). */
  fcfPerShare: number;
  /** Annual dividend per share (forward or trailing). */
  dividendPerShare: number;
  /** Tangible book value per share. */
  tangibleBookPerShare: number;
  /** Suggested EPS growth-stage rate (decimal), capped 5–20% from ~10y diluted EPS. */
  suggestedEpsGrowthRate: number;
  /** Suggested FCF growth-stage rate (decimal), capped 5–20% from ~10y FCF/share. */
  suggestedFcfGrowthRate: number;
};

type CfRow = { date: Date; freeCashFlow?: number };
type BsRow = {
  date: Date;
  netDebt?: number;
  totalStockholderEquity?: number;
  goodwill?: number;
  intangibleAssets?: number;
};
type FinRow = {
  date: Date;
  totalRevenue?: number;
  operatingIncome?: number;
  netIncome?: number;
  ebitda?: number;
  dilutedEPS?: number;
};

function perShare(total: number, shares: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(shares) || shares <= 0) return 0;
  return total / shares;
}

function pickTrailingEps(
  investorTrailingEps: number | null,
  latestDilutedEps: number | null,
): number {
  if (investorTrailingEps != null && Number.isFinite(investorTrailingEps)) {
    return investorTrailingEps;
  }
  if (latestDilutedEps != null && Number.isFinite(latestDilutedEps)) {
    return latestDilutedEps;
  }
  return 0;
}

function suggestedGrowthFromHistory(cagr: number | null, fallback = 0.1): number {
  if (cagr == null || !Number.isFinite(cagr)) return capGuruFocusGrowthRate(fallback);
  return capGuruFocusGrowthRate(cagr);
}

function cagrFromWindowEndpoints<T>(
  rows: T[],
  pick: (row: T) => number | null,
): number | null {
  if (rows.length < 2) return null;
  const start = pick(rows[0]);
  const end = pick(rows[rows.length - 1]);
  const years = rows.length - 1;
  if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start <= 0 || end <= 0 || years <= 0) return null;
  const rate = (end / start) ** (1 / years) - 1;
  return Number.isFinite(rate) ? rate : null;
}

export async function fetchDcfSeed(symbol: string): Promise<DcfSeed | null> {
  const sym = symbol.trim().toUpperCase();
  const period2 = new Date().toISOString().slice(0, 10);

  try {
    const [qRaw, qs, cashRows, bsRows, finRows] = await Promise.all([
      yahooFinance.quote(sym),
      yahooFinance
        .quoteSummary(sym, {
          modules: ["summaryDetail", "financialData", "defaultKeyStatistics", "price"],
        })
        .catch(() => null),
      yahooFinance.fundamentalsTimeSeries(sym, {
        period1: "2010-01-01",
        period2,
        type: "annual",
        module: "cash-flow",
      }),
      yahooFinance.fundamentalsTimeSeries(sym, {
        period1: "2010-01-01",
        period2,
        type: "annual",
        module: "balance-sheet",
      }),
      yahooFinance.fundamentalsTimeSeries(sym, {
        period1: "2010-01-01",
        period2,
        type: "annual",
        module: "financials",
      }),
    ]);

    const q = Array.isArray(qRaw) ? qRaw[0] : qRaw;
    if (!q || (q as { quoteType?: string }).quoteType === "NONE") {
      return null;
    }

    const qr = q as Record<string, unknown>;
    const investor = mapInvestorMetrics(qr, qs as Record<string, unknown> | null);

    const price = Number(qr.regularMarketPrice ?? 0);
    let shares = Number(qr.sharesOutstanding ?? investor.sharesOutstanding ?? 0);
    if (!Number.isFinite(shares) || shares <= 0) {
      const mc = Number(qr.marketCap ?? 0);
      if (mc > 0 && price > 0) shares = mc / price;
    }

    const cashSorted = (cashRows as CfRow[])
      .filter((r) => r?.date)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const latestCf = cashSorted[cashSorted.length - 1];
    const baseFcf = Number(latestCf?.freeCashFlow ?? 0);

    const bsSorted = (bsRows as BsRow[])
      .filter((r) => r?.date)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const latestBs = bsSorted[bsSorted.length - 1];
    const netDebt = Math.max(0, Number(latestBs?.netDebt ?? 0));
    const equity = Number(latestBs?.totalStockholderEquity ?? 0);
    const goodwill = Math.max(0, Number(latestBs?.goodwill ?? 0));
    const intangibles = Math.max(0, Number(latestBs?.intangibleAssets ?? 0));
    const tangibleEquity = Math.max(0, equity - goodwill - intangibles);

    const finSorted = (finRows as FinRow[])
      .filter((r) => r?.date)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const latestFin = finSorted[finSorted.length - 1];
    const revenue = Math.max(0, Number(latestFin?.totalRevenue ?? 0));
    const opInc = Number(latestFin?.operatingIncome ?? NaN);
    const operatingMarginPct =
      revenue > 0 && Number.isFinite(opInc) ? (opInc / revenue) * 100 : null;
    const netIncome = Number(latestFin?.netIncome ?? 0);
    const ebitdaRaw = latestFin?.ebitda;
    const ebitda =
      ebitdaRaw !== undefined && Number.isFinite(Number(ebitdaRaw))
        ? Number(ebitdaRaw)
        : null;

    const latestDilutedEps = Number(latestFin?.dilutedEPS ?? NaN);
    const epsPerShare = pickTrailingEps(
      investor.trailingEps,
      Number.isFinite(latestDilutedEps) ? latestDilutedEps : null,
    );
    const fcfPerShare = perShare(baseFcf, shares);
    const dividendPerShare = Math.max(
      0,
      Number(
        investor.dividendRate ??
          qr.dividendRate ??
          qr.trailingAnnualDividendRate ??
          0,
      ),
    );
    const tangibleBookPerShare = perShare(tangibleEquity, shares);

    const epsCagr = cagrFromWindowEndpoints(finSorted.slice(-11), (r) => {
      const v = Number(r.dilutedEPS ?? NaN);
      return Number.isFinite(v) ? v : null;
    });

    const fcfCagr = cagrFromWindowEndpoints(cashSorted.slice(-11), (r) => {
      const v = Number(r.freeCashFlow ?? NaN);
      return Number.isFinite(v) ? perShare(v, shares) : null;
    });

    const earningsGrowthFallback =
      investor.earningsGrowth != null && Number.isFinite(investor.earningsGrowth)
        ? investor.earningsGrowth
        : 0.1;

    return {
      symbol: String(qr.symbol ?? sym).toUpperCase(),
      name: String(qr.longName ?? qr.shortName ?? sym),
      currentPrice: price,
      revenue,
      operatingMarginPct,
      netIncome,
      ebitda,
      baseFcf,
      sharesOutstanding: shares,
      netDebt,
      epsPerShare,
      fcfPerShare,
      dividendPerShare,
      tangibleBookPerShare,
      suggestedEpsGrowthRate: suggestedGrowthFromHistory(epsCagr, earningsGrowthFallback),
      suggestedFcfGrowthRate: suggestedGrowthFromHistory(fcfCagr, earningsGrowthFallback),
    };
  } catch {
    return null;
  }
}
