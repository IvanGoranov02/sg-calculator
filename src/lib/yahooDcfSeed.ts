/**
 * Server-only: snapshot metrics + FCF / shares / net debt from Yahoo Finance.
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
};

type CfRow = { date: Date; freeCashFlow?: number };
type BsRow = { date: Date; netDebt?: number };
type FinRow = {
  date: Date;
  totalRevenue?: number;
  operatingIncome?: number;
  netIncome?: number;
  ebitda?: number;
};

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
    };
  } catch {
    return null;
  }
}
