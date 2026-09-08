/**
 * Server-only: snapshot metrics + per-share bases for GuruFocus-style DCF from Yahoo Finance.
 */

import YahooFinance from "yahoo-finance2";

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
  /** EPS proxy: latest net income / shares (w/o NRI adjustment). */
  epsPerShare: number;
  /** FCF per share. */
  fcfPerShare: number;
  /** Annual dividend per share (forward or trailing). */
  dividendPerShare: number;
  /** Tangible book value per share. */
  tangibleBookPerShare: number;
  /** Suggested growth-stage rate (decimal), capped 5–20% from ~10y history. */
  suggestedGrowthRate: number;
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
};

function perShare(total: number, shares: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(shares) || shares <= 0) return 0;
  return total / shares;
}

/** CAGR from first positive to last positive value across sorted annual rows. */
function cagrFromSeries(values: number[]): number | null {
  const positives = values.filter((v) => Number.isFinite(v) && v > 0);
  if (positives.length < 2) return null;
  const start = positives[0];
  const end = positives[positives.length - 1];
  const years = positives.length - 1;
  if (start <= 0 || end <= 0 || years <= 0) return null;
  return (end / start) ** (1 / years) - 1;
}

function capGrowth(rate: number): number {
  return Math.min(0.2, Math.max(0.05, rate));
}

export async function fetchDcfSeed(symbol: string): Promise<DcfSeed | null> {
  const sym = symbol.trim().toUpperCase();
  const period2 = new Date().toISOString().slice(0, 10);

  try {
    const [qRaw, cashRows, bsRows, finRows] = await Promise.all([
      yahooFinance.quote(sym),
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

    const qr = q as {
      shortName?: string;
      longName?: string;
      symbol?: string;
      regularMarketPrice?: number;
      sharesOutstanding?: number;
      marketCap?: number;
      dividendRate?: number;
      trailingAnnualDividendRate?: number;
    };

    const price = Number(qr.regularMarketPrice ?? 0);
    let shares = Number(qr.sharesOutstanding ?? 0);
    if (!Number.isFinite(shares) || shares <= 0) {
      const mc = Number(qr.marketCap ?? 0);
      if (mc > 0 && price > 0) shares = mc / price;
    }

    const cashSorted = (cashRows as CfRow[])
      .filter((r) => r?.date)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const latestCf = cashSorted[cashSorted.length - 1];
    const baseFcf = Math.max(0, Number(latestCf?.freeCashFlow ?? 0));

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

    const epsPerShare = perShare(netIncome, shares);
    const fcfPerShare = perShare(baseFcf, shares);
    const dividendPerShare = Math.max(
      0,
      Number(
        qr.dividendRate ??
          qr.trailingAnnualDividendRate ??
          0,
      ),
    );
    const tangibleBookPerShare = perShare(tangibleEquity, shares);

    const recentFin = finSorted.slice(-11);
    const epsSeries = recentFin.map((r) => perShare(Number(r.netIncome ?? 0), shares));
    const fcfSeries = cashSorted.slice(-11).map((r) => perShare(Number(r.freeCashFlow ?? 0), shares));
    const epsCagr = cagrFromSeries(epsSeries);
    const fcfCagr = cagrFromSeries(fcfSeries);
    const rawGrowth = epsCagr ?? fcfCagr ?? 0.1;
    const suggestedGrowthRate = capGrowth(rawGrowth);

    return {
      symbol: (qr.symbol ?? sym).toUpperCase(),
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
      suggestedGrowthRate,
    };
  } catch {
    return null;
  }
}
