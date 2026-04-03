/**
 * Server-only: annual + quarterly fundamentals for DCF charts (Yahoo Finance).
 */

import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

export type DcfFundamentalPoint = {
  periodEnd: string;
  label: string;
  revenue: number;
  /** Operating income / revenue × 100, or null if not meaningful */
  operatingMarginPct: number | null;
  netIncome: number;
  ebitda: number | null;
  freeCashFlow: number;
};

export type DcfFundamentalsHistory = {
  annual: DcfFundamentalPoint[];
  quarterly: DcfFundamentalPoint[];
};

type FinRow = {
  date: Date;
  totalRevenue?: number;
  operatingIncome?: number;
  netIncome?: number;
  ebitda?: number;
};

type CfRow = { date: Date; freeCashFlow?: number };

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatPeriodLabel(d: Date, quarterly: boolean): string {
  if (!quarterly) {
    return `FY ${d.getUTCFullYear()}`;
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function mergeFundamentalSeries(
  finRows: FinRow[],
  cfRows: CfRow[],
  quarterly: boolean,
): DcfFundamentalPoint[] {
  const cfMap = new Map<string, number>();
  for (const r of cfRows) {
    if (!r?.date) continue;
    const k = toDateKey(r.date);
    cfMap.set(k, Number(r.freeCashFlow ?? 0));
  }

  const sorted = [...finRows]
    .filter((r) => r?.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return sorted.map((f) => {
    const k = toDateKey(f.date);
    const rev = Number(f.totalRevenue ?? 0);
    const opInc = f.operatingIncome;
    const margin =
      rev > 0 && opInc !== undefined && Number.isFinite(Number(opInc))
        ? (Number(opInc) / rev) * 100
        : null;
    const ebitdaRaw = f.ebitda;
    return {
      periodEnd: k,
      label: formatPeriodLabel(f.date, quarterly),
      revenue: rev,
      operatingMarginPct: margin,
      netIncome: Number(f.netIncome ?? 0),
      ebitda:
        ebitdaRaw !== undefined && Number.isFinite(Number(ebitdaRaw)) ? Number(ebitdaRaw) : null,
      freeCashFlow: cfMap.get(k) ?? 0,
    };
  });
}

async function fetchModule(
  sym: string,
  type: "annual" | "quarterly",
  module: "financials" | "cash-flow",
): Promise<unknown[]> {
  const period2 = new Date().toISOString().slice(0, 10);
  const raw = await yahooFinance.fundamentalsTimeSeries(sym, {
    period1: "2010-01-01",
    period2,
    type,
    module,
  });
  return Array.isArray(raw) ? raw : [];
}

export async function fetchDcfFundamentalsHistory(
  symbol: string,
): Promise<DcfFundamentalsHistory | null> {
  const sym = symbol.trim().toUpperCase();
  try {
    const [finA, finQ, cfA, cfQ] = await Promise.all([
      fetchModule(sym, "annual", "financials"),
      fetchModule(sym, "quarterly", "financials"),
      fetchModule(sym, "annual", "cash-flow"),
      fetchModule(sym, "quarterly", "cash-flow"),
    ]);

    const annual = mergeFundamentalSeries(finA as FinRow[], cfA as CfRow[], false);
    const quarterly = mergeFundamentalSeries(finQ as FinRow[], cfQ as CfRow[], true);

    if (annual.length === 0 && quarterly.length === 0) {
      return null;
    }

    return { annual, quarterly };
  } catch {
    return null;
  }
}
