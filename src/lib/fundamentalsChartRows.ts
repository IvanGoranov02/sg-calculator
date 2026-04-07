import { safePct, safeRatio } from "@/lib/annualTables";
import { isEmptyIncomeStatementCore, type StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { sortIncomeByYearAsc, sortQuarterlyByDateAsc } from "@/lib/stockAnalysisTypes";

/** ISO date (period end) for filtering; stripped before passing to Recharts. Annual rows also carry `fiscalYear`. */
export type FundamentalsChartRow = Record<string, unknown> & { periodEnd?: string; fiscalYear?: string };

export function rowsForCharts(rows: FundamentalsChartRow[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const { periodEnd: _p, fiscalYear: _fy, ...rest } = r;
    return rest;
  });
}

function isStubIncome(r: {
  revenue: number;
  netIncome: number;
  grossProfit: number;
  operatingIncome?: number;
}): boolean {
  return isEmptyIncomeStatementCore(r);
}

export function buildAnnualChartRows(
  bundle: StockAnalysisBundle,
  formatYear: (fy: string) => string,
): FundamentalsChartRow[] {
  const inc = sortIncomeByYearAsc(bundle.income).filter((r) => !isStubIncome(r));
  const cfMap = new Map(bundle.cashFlow.map((c) => [c.fiscalYear, c]));
  const bsMap = new Map(bundle.balanceSheet.map((b) => [b.fiscalYear, b]));
  return inc.map((r) => {
    const cf = cfMap.get(r.fiscalYear);
    const bs = bsMap.get(r.fiscalYear);
    const rev = r.revenue;
    const ebitda = r.ebitda ?? null;
    return {
      label: formatYear(r.fiscalYear),
      fiscalYear: r.fiscalYear,
      periodEnd: r.date.slice(0, 10),
      revenue: r.revenue,
      netIncome: r.netIncome,
      operatingIncome: r.operatingIncome ?? null,
      grossProfit: r.grossProfit,
      operatingExpenses: r.operatingExpenses,
      ebitda,
      grossMargin: safePct(r.grossProfit, rev),
      operatingMargin: r.operatingIncome != null ? safePct(r.operatingIncome, rev) : null,
      netMargin: safePct(r.netIncome, rev),
      ebitdaMargin: ebitda != null && rev !== 0 ? safePct(ebitda, rev) : null,
      ocfMargin:
        cf?.operatingCashFlow != null && rev !== 0 ? safePct(cf.operatingCashFlow, rev) : null,
      ocf: cf?.operatingCashFlow ?? null,
      fcf: cf?.freeCashFlow ?? null,
      capex: cf?.capitalExpenditure ?? null,
      investCf: cf?.investingCashFlow ?? null,
      financeCf: cf?.financingCashFlow ?? null,
      dividendsPaid: cf?.dividendsPaid ?? null,
      stockRepurchase: cf?.stockRepurchase ?? null,
      dividendsPaidPos: cf?.dividendsPaid != null ? Math.abs(cf.dividendsPaid) : null,
      stockRepurchasePos: cf?.stockRepurchase != null ? Math.abs(cf.stockRepurchase) : null,
      totalAssets: bs?.totalAssets ?? null,
      totalDebt: bs?.totalDebt ?? null,
      equity: bs?.stockholdersEquity ?? null,
      cash: bs?.cashAndCashEquivalents ?? null,
      netDebt: bs?.netDebt ?? null,
      ar: bs?.accountsReceivable ?? null,
      inventory: bs?.inventory ?? null,
      goodwill: bs?.goodwill ?? null,
      longTermDebt: bs?.longTermDebt ?? null,
      currentRatio: safeRatio(bs?.totalCurrentAssets ?? null, bs?.totalCurrentLiabilities ?? null),
      quickRatio: safeRatio(
        bs?.totalCurrentAssets != null && bs?.inventory != null
          ? bs.totalCurrentAssets - bs.inventory
          : null,
        bs?.totalCurrentLiabilities ?? null,
      ),
      debtToEquity: safeRatio(bs?.totalDebt ?? null, bs?.stockholdersEquity ?? null),
      debtPctCapital:
        bs?.totalDebt != null && bs?.stockholdersEquity != null
          ? (() => {
              const td = bs.totalDebt;
              const eq = bs.stockholdersEquity;
              const cap = td + eq;
              return cap !== 0 && Number.isFinite(cap) ? safePct(td, cap) : null;
            })()
          : null,
      netDebtToEbitda:
        ebitda != null && bs?.netDebt != null && ebitda > 0
          ? safeRatio(bs.netDebt, ebitda)
          : null,
      capexIntensity:
        cf?.capitalExpenditure != null && rev !== 0
          ? safePct(Math.abs(cf.capitalExpenditure), rev)
          : null,
      roe:
        bs?.stockholdersEquity != null && bs.stockholdersEquity !== 0
          ? safePct(r.netIncome, bs.stockholdersEquity)
          : null,
      roa: bs?.totalAssets != null && bs.totalAssets !== 0 ? safePct(r.netIncome, bs.totalAssets) : null,
      fcfMargin: cf != null && rev !== 0 ? safePct(cf.freeCashFlow, rev) : null,
      dilutedEps: r.dilutedEps ?? null,
      dilutedShares: r.dilutedAverageShares ?? null,
    };
  });
}

export function buildQuarterlyChartRows(
  bundle: StockAnalysisBundle,
  formatPeriod: (dateIso: string) => string,
): FundamentalsChartRow[] {
  const inc = sortQuarterlyByDateAsc(bundle.incomeQuarterly).filter((r) => !isStubIncome(r));
  const cfByDate = new Map(bundle.cashFlowQuarterly.map((c) => [c.date.slice(0, 10), c]));
  const bsByDate = new Map(bundle.balanceSheetQuarterly.map((b) => [b.date.slice(0, 10), b]));
  return inc.map((r) => {
    const cf = cfByDate.get(r.date.slice(0, 10));
    const bs = bsByDate.get(r.date.slice(0, 10));
    const rev = r.revenue;
    const ebitda = r.ebitda ?? null;
    return {
      label: formatPeriod(r.date),
      periodEnd: r.date.slice(0, 10),
      revenue: r.revenue,
      netIncome: r.netIncome,
      operatingIncome: r.operatingIncome ?? null,
      grossProfit: r.grossProfit,
      operatingExpenses: r.operatingExpenses,
      ebitda,
      grossMargin: safePct(r.grossProfit, rev),
      operatingMargin: r.operatingIncome != null ? safePct(r.operatingIncome, rev) : null,
      netMargin: safePct(r.netIncome, rev),
      ebitdaMargin: ebitda != null && rev !== 0 ? safePct(ebitda, rev) : null,
      ocfMargin:
        cf?.operatingCashFlow != null && rev !== 0 ? safePct(cf.operatingCashFlow, rev) : null,
      ocf: cf?.operatingCashFlow ?? null,
      fcf: cf?.freeCashFlow ?? null,
      capex: cf?.capitalExpenditure ?? null,
      investCf: cf?.investingCashFlow ?? null,
      financeCf: cf?.financingCashFlow ?? null,
      dividendsPaid: cf?.dividendsPaid ?? null,
      stockRepurchase: cf?.stockRepurchase ?? null,
      dividendsPaidPos: cf?.dividendsPaid != null ? Math.abs(cf.dividendsPaid) : null,
      stockRepurchasePos: cf?.stockRepurchase != null ? Math.abs(cf.stockRepurchase) : null,
      totalAssets: bs?.totalAssets ?? null,
      totalDebt: bs?.totalDebt ?? null,
      equity: bs?.stockholdersEquity ?? null,
      cash: bs?.cashAndCashEquivalents ?? null,
      netDebt: bs?.netDebt ?? null,
      ar: bs?.accountsReceivable ?? null,
      inventory: bs?.inventory ?? null,
      goodwill: bs?.goodwill ?? null,
      longTermDebt: bs?.longTermDebt ?? null,
      currentRatio: safeRatio(bs?.totalCurrentAssets ?? null, bs?.totalCurrentLiabilities ?? null),
      quickRatio: safeRatio(
        bs?.totalCurrentAssets != null && bs?.inventory != null
          ? bs.totalCurrentAssets - bs.inventory
          : null,
        bs?.totalCurrentLiabilities ?? null,
      ),
      debtToEquity: safeRatio(bs?.totalDebt ?? null, bs?.stockholdersEquity ?? null),
      debtPctCapital:
        bs?.totalDebt != null && bs?.stockholdersEquity != null
          ? (() => {
              const td = bs.totalDebt;
              const eq = bs.stockholdersEquity;
              const cap = td + eq;
              return cap !== 0 && Number.isFinite(cap) ? safePct(td, cap) : null;
            })()
          : null,
      netDebtToEbitda:
        ebitda != null && bs?.netDebt != null && ebitda > 0
          ? safeRatio(bs.netDebt, ebitda)
          : null,
      capexIntensity:
        cf?.capitalExpenditure != null && rev !== 0
          ? safePct(Math.abs(cf.capitalExpenditure), rev)
          : null,
      roe:
        bs?.stockholdersEquity != null && bs.stockholdersEquity !== 0
          ? safePct(r.netIncome, bs.stockholdersEquity)
          : null,
      roa: bs?.totalAssets != null && bs.totalAssets !== 0 ? safePct(r.netIncome, bs.totalAssets) : null,
      fcfMargin: cf != null && rev !== 0 ? safePct(cf.freeCashFlow, rev) : null,
      dilutedEps: r.dilutedEps ?? null,
      dilutedShares: r.dilutedAverageShares ?? null,
    };
  });
}

export function pctPop(prevRaw: unknown, currRaw: unknown): number | null {
  const prev = Number(prevRaw);
  const curr = Number(currRaw);
  if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export function enrichPopGrowth(rows: FundamentalsChartRow[]): FundamentalsChartRow[] {
  return rows.map((row, i) => {
    const base = { ...row } as FundamentalsChartRow;
    if (i === 0) {
      base.revPopGrowth = null;
      base.niPopGrowth = null;
      base.grossPopGrowth = null;
      base.ocfPopGrowth = null;
      base.fcfPopGrowth = null;
      base.ebitdaPopGrowth = null;
      base.dilutedEpsPopGrowth = null;
      base.operatingIncomePopGrowth = null;
      base.opexPopGrowth = null;
      return base;
    }
    const prev = rows[i - 1]!;
    const rev = Number(base.revenue);
    const prevRev = Number(prev.revenue);
    const ni = Number(base.netIncome);
    const prevNi = Number(prev.netIncome);
    base.revPopGrowth =
      Number.isFinite(rev) && Number.isFinite(prevRev) && prevRev !== 0
        ? ((rev - prevRev) / prevRev) * 100
        : null;
    base.niPopGrowth =
      Number.isFinite(ni) && Number.isFinite(prevNi) && prevNi !== 0
        ? ((ni - prevNi) / prevNi) * 100
        : null;
    base.grossPopGrowth = pctPop(prev.grossProfit, base.grossProfit);
    base.ocfPopGrowth = pctPop(prev.ocf, base.ocf);
    base.fcfPopGrowth = pctPop(prev.fcf, base.fcf);
    base.ebitdaPopGrowth = pctPop(prev.ebitda, base.ebitda);
    base.dilutedEpsPopGrowth = pctPop(prev.dilutedEps, base.dilutedEps);
    base.operatingIncomePopGrowth = pctPop(prev.operatingIncome, base.operatingIncome);
    base.opexPopGrowth = pctPop(prev.operatingExpenses, base.operatingExpenses);
    return base;
  });
}
