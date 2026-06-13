/**
 * Optional 4th Gemini pass: fill null fundamentals in the 5y window without overwriting existing values.
 */

import { callGeminiJson } from "@/lib/geminiFullStockBundle";
import { defaultGeminiModel, getGeminiApiKey } from "@/lib/geminiClient";
import { bundleHasYahooSecDataGaps } from "@/lib/stockBundleGaps";
import { annualDisplayFiscalYears } from "@/lib/stockPeriodCore";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

function pickNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function isNullishNum(v: number | null | undefined): boolean {
  return v == null || !Number.isFinite(v);
}

function mergeGapScalar(cur: number, incoming: unknown): number {
  const n = pickNum(incoming);
  if (n == null) return cur;
  if (isNullishNum(cur) || cur === 0) return n;
  return cur;
}

function mergeGapNullable(cur: number | null | undefined, incoming: unknown): number | null {
  const n = pickNum(incoming);
  if (n == null) return cur ?? null;
  if (cur == null) return n;
  if (cur === 0) return n;
  return cur;
}

function mergeGapFillIntoBundle(bundle: StockAnalysisBundle, parsed: unknown): void {
  if (!parsed || typeof parsed !== "object") return;
  const b = parsed as Record<string, unknown>;

  const incByFy = new Map<string, Record<string, unknown>>();
  if (Array.isArray(b.income)) {
    for (const raw of b.income) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const fy = String(o.fiscalYear ?? o.year ?? "").trim();
      if (fy) incByFy.set(fy, o);
    }
  }

  bundle.income = bundle.income.map((row) => {
    const g = incByFy.get(row.fiscalYear);
    if (!g) return row;
    return {
      ...row,
      revenue: mergeGapScalar(row.revenue, g.revenue ?? g.totalRevenue),
      grossProfit: mergeGapScalar(row.grossProfit, g.grossProfit),
      operatingExpenses: mergeGapScalar(row.operatingExpenses, g.operatingExpenses ?? g.operatingExpense),
      netIncome: mergeGapScalar(row.netIncome, g.netIncome),
      operatingIncome:
        row.operatingIncome == null
          ? (pickNum(g.operatingIncome) ?? undefined)
          : row.operatingIncome,
      ebitda: row.ebitda == null ? (pickNum(g.ebitda ?? g.EBITDA) ?? undefined) : row.ebitda,
      dilutedEps:
        row.dilutedEps == null ? (pickNum(g.dilutedEps ?? g.eps) ?? undefined) : row.dilutedEps,
      dilutedAverageShares:
        row.dilutedAverageShares == null
          ? (pickNum(g.dilutedAverageShares ?? g.dilutedShares) ?? undefined)
          : row.dilutedAverageShares,
    };
  });

  const cfByFy = new Map<string, Record<string, unknown>>();
  if (Array.isArray(b.cashFlow)) {
    for (const raw of b.cashFlow) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const fy = String(o.fiscalYear ?? o.year ?? "").trim();
      if (fy) cfByFy.set(fy, o);
    }
  }

  bundle.cashFlow = bundle.cashFlow.map((row) => {
    const g = cfByFy.get(row.fiscalYear);
    if (!g) return row;
    return {
      ...row,
      freeCashFlow: mergeGapScalar(row.freeCashFlow, g.freeCashFlow),
      operatingCashFlow: mergeGapNullable(row.operatingCashFlow, g.operatingCashFlow) ?? row.operatingCashFlow,
      capitalExpenditure: mergeGapNullable(row.capitalExpenditure, g.capitalExpenditure) ?? row.capitalExpenditure,
    };
  });

  const bsByFy = new Map<string, Record<string, unknown>>();
  if (Array.isArray(b.balanceSheet)) {
    for (const raw of b.balanceSheet) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const fy = String(o.fiscalYear ?? o.year ?? "").trim();
      if (fy) bsByFy.set(fy, o);
    }
  }

  bundle.balanceSheet = bundle.balanceSheet.map((row) => {
    const g = bsByFy.get(row.fiscalYear);
    if (!g) return row;
    return {
      ...row,
      totalAssets: mergeGapNullable(row.totalAssets, g.totalAssets),
      totalDebt: mergeGapNullable(row.totalDebt, g.totalDebt),
      stockholdersEquity: mergeGapNullable(row.stockholdersEquity, g.stockholdersEquity),
      totalCurrentAssets: mergeGapNullable(row.totalCurrentAssets, g.totalCurrentAssets ?? g.currentAssets),
      totalCurrentLiabilities: mergeGapNullable(
        row.totalCurrentLiabilities,
        g.totalCurrentLiabilities ?? g.currentLiabilities,
      ),
      inventory: mergeGapNullable(row.inventory, g.inventory),
    };
  });

  const incQByDate = new Map<string, Record<string, unknown>>();
  if (Array.isArray(b.incomeQuarterly)) {
    for (const raw of b.incomeQuarterly) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const d = String(o.date ?? o.periodEnd ?? "").slice(0, 10);
      if (d.length >= 10) incQByDate.set(d, o);
    }
  }

  bundle.incomeQuarterly = bundle.incomeQuarterly.map((row) => {
    const g = incQByDate.get(row.date.slice(0, 10));
    if (!g) return row;
    return {
      ...row,
      revenue: mergeGapScalar(row.revenue, g.revenue),
      grossProfit: mergeGapScalar(row.grossProfit, g.grossProfit),
      operatingExpenses: mergeGapScalar(row.operatingExpenses, g.operatingExpenses),
      netIncome: mergeGapScalar(row.netIncome, g.netIncome),
      dilutedEps:
        row.dilutedEps == null ? (pickNum(g.dilutedEps ?? g.eps) ?? undefined) : row.dilutedEps,
      dilutedAverageShares:
        row.dilutedAverageShares == null
          ? (pickNum(g.dilutedAverageShares ?? g.dilutedShares) ?? undefined)
          : row.dilutedAverageShares,
    };
  });

  const cfQByDate = new Map<string, Record<string, unknown>>();
  if (Array.isArray(b.cashFlowQuarterly)) {
    for (const raw of b.cashFlowQuarterly) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const d = String(o.date ?? o.periodEnd ?? "").slice(0, 10);
      if (d.length >= 10) cfQByDate.set(d, o);
    }
  }

  bundle.cashFlowQuarterly = bundle.cashFlowQuarterly.map((row) => {
    const g = cfQByDate.get(row.date.slice(0, 10));
    if (!g) return row;
    return {
      ...row,
      operatingCashFlow: mergeGapNullable(row.operatingCashFlow, g.operatingCashFlow),
      capitalExpenditure: mergeGapNullable(row.capitalExpenditure, g.capitalExpenditure),
      freeCashFlow: mergeGapScalar(row.freeCashFlow, g.freeCashFlow),
    };
  });

  const bsQByDate = new Map<string, Record<string, unknown>>();
  if (Array.isArray(b.balanceSheetQuarterly)) {
    for (const raw of b.balanceSheetQuarterly) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const d = String(o.date ?? o.periodEnd ?? "").slice(0, 10);
      if (d.length >= 10) bsQByDate.set(d, o);
    }
  }

  bundle.balanceSheetQuarterly = bundle.balanceSheetQuarterly.map((row) => {
    const g = bsQByDate.get(row.date.slice(0, 10));
    if (!g) return row;
    return {
      ...row,
      totalAssets: mergeGapNullable(row.totalAssets, g.totalAssets),
      totalDebt: mergeGapNullable(row.totalDebt, g.totalDebt),
      stockholdersEquity: mergeGapNullable(row.stockholdersEquity, g.stockholdersEquity),
      totalCurrentAssets: mergeGapNullable(row.totalCurrentAssets, g.totalCurrentAssets ?? g.currentAssets),
      totalCurrentLiabilities: mergeGapNullable(
        row.totalCurrentLiabilities,
        g.totalCurrentLiabilities ?? g.currentLiabilities,
      ),
      inventory: mergeGapNullable(row.inventory, g.inventory),
    };
  });

  const divQByDate = new Map<string, Record<string, unknown>>();
  if (Array.isArray(b.dividendQuarterly)) {
    for (const raw of b.dividendQuarterly) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const d = String(o.date ?? "").slice(0, 10);
      if (d.length >= 10) divQByDate.set(d, o);
    }
  }

  bundle.dividendQuarterly = bundle.dividendQuarterly.map((row) => {
    const g = divQByDate.get(row.date.slice(0, 10));
    if (!g) return row;
    const dps = pickNum(g.dividendPerShare);
    if (dps == null) return row;
    if (row.dividendPerShare != null && row.dividendPerShare !== 0) return row;
    return { ...row, dividendPerShare: dps };
  });
}

function buildGapFillPrompt(
  bundle: StockAnalysisBundle,
  displayYears: string[],
  retry: number,
): string {
  const sym = bundle.quote.symbol.trim().toUpperCase();
  const today = new Date().toISOString().slice(0, 10);
  const qDates = bundle.incomeQuarterly.map((r) => r.date.slice(0, 10)).join(", ");
  const extra = retry > 0 ? " Second pass — fill every remaining null in the lists below." : "";

  return `You are filling ONLY missing null/zero placeholder fields in a stock fundamentals JSON for ${sym}.
Today (UTC): ${today}.${extra}

Return JSON only with these keys (arrays may be partial — include only rows you are filling):
- income (annual, fiscalYear + revenue, grossProfit, operatingExpenses, netIncome, operatingIncome, ebitda, dilutedEps, dilutedShares)
- cashFlow (annual, fiscalYear + freeCashFlow, operatingCashFlow, capitalExpenditure)
- balanceSheet (annual, fiscalYear + totalAssets, totalDebt, stockholdersEquity, totalCurrentAssets, totalCurrentLiabilities, inventory)
- incomeQuarterly (date YYYY-MM-DD + revenue, grossProfit, operatingExpenses, netIncome, dilutedEps, dilutedShares)
- cashFlowQuarterly (date + operatingCashFlow, capitalExpenditure, freeCashFlow)
- balanceSheetQuarterly (date + totalAssets, totalDebt, stockholdersEquity, totalCurrentAssets, totalCurrentLiabilities, inventory)
- dividendQuarterly (date + dividendPerShare)

Use filing-accurate consolidated figures. Do NOT change fields that already have real non-zero values.
If you are not confident in a figure exactly as publicly reported, OMIT it — never estimate or interpolate.

Annual fiscal years to cover: ${displayYears.join(", ")}
Quarter dates in bundle: ${qDates}

Output valid JSON object only.`;
}

export async function fillBundleGapsFromGemini(bundle: StockAnalysisBundle): Promise<void> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return;

  const displayYears = annualDisplayFiscalYears(bundle, "5y", null, null);

  for (let attempt = 0; attempt < 2; attempt++) {
    if (!bundleHasYahooSecDataGaps(bundle, displayYears)) return;

    try {
      const raw = await callGeminiJson(
        apiKey,
        defaultGeminiModel(),
        buildGapFillPrompt(bundle, displayYears, attempt),
        8192,
      );
      mergeGapFillIntoBundle(bundle, raw);
    } catch (e) {
      console.warn("[gemini gap-fill]", e instanceof Error ? e.message : e);
      return;
    }
  }
}
