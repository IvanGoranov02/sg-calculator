/**
 * Quarterly history backfill for EDGAR-sourced bundles with thin quarterly data
 * (typically 20-F / ADR filers: EDGAR has annual XBRL only, Yahoo keeps ~6 quarters).
 *
 * Trust model: Gemini may propose older quarters, but a fiscal year is accepted
 * ONLY if its four quarters reconcile with the authoritative SEC annual totals
 * already in the bundle (revenue within 3%, net income within 8%). Quarters that
 * cannot be validated against a filed annual are discarded, and existing
 * EDGAR/Yahoo quarters are never overwritten.
 */

import { defaultGeminiModel, getGeminiApiKey } from "@/lib/geminiClient";
import { callGeminiJson } from "@/lib/geminiFullStockBundle";
import { FUNDAMENTALS_MAX_QUARTERS } from "@/lib/fundamentalsHistoryLimits";
import { alignQuarterlyToIncome, trimQuarterlyToMax } from "@/lib/quarterlyAlign";
import {
  sortQuarterlyByDateAsc,
  type CashFlowQuarter,
  type IncomeStatementQuarter,
  type StockAnalysisBundle,
} from "@/lib/stockAnalysisTypes";

/** Backfill when a "5y" view would show fewer than this many quarters. */
export const QUARTERLY_BACKFILL_MIN = 12;

export const REVENUE_TOLERANCE = 0.03;
export const NET_INCOME_TOLERANCE = 0.08;

function pickNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function isoDate(v: unknown): string | null {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function quarterlyHistoryIsThin(bundle: StockAnalysisBundle): boolean {
  return bundle.incomeQuarterly.length < QUARTERLY_BACKFILL_MIN;
}

type FiscalWindow = { fiscalYear: string; start: string; end: string };

/** Fiscal-year windows (exclusive start, inclusive end) from the bundle's annual rows. */
function fiscalWindows(bundle: StockAnalysisBundle): FiscalWindow[] {
  const annuals = [...bundle.income]
    .filter((r) => isoDate(r.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  return annuals.map((row, i) => {
    const prevEnd =
      i > 0
        ? annuals[i - 1].date.slice(0, 10)
        : new Date(Date.parse(row.date) - 370 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { fiscalYear: row.fiscalYear, start: prevEnd, end: row.date.slice(0, 10) };
  });
}

function withinTolerance(sum: number, annual: number, tolerance: number): boolean {
  if (!Number.isFinite(sum) || !Number.isFinite(annual) || annual === 0) return false;
  return Math.abs(sum - annual) <= Math.abs(annual) * tolerance;
}

type ParsedIncomeQ = {
  date: string;
  revenue: number;
  grossProfit: number | null;
  operatingExpenses: number | null;
  netIncome: number;
  operatingIncome: number | null;
  dilutedEps: number | null;
  dilutedAverageShares: number | null;
};

type ParsedCashFlowQ = {
  date: string;
  operatingCashFlow: number;
  capitalExpenditure: number | null;
  freeCashFlow: number | null;
};

function parseIncomeQuarters(parsed: unknown): ParsedIncomeQ[] {
  if (!parsed || typeof parsed !== "object") return [];
  const arr = (parsed as Record<string, unknown>).incomeQuarterly;
  if (!Array.isArray(arr)) return [];
  const out: ParsedIncomeQ[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const date = isoDate(o.date ?? o.periodEnd);
    const revenue = pickNum(o.revenue);
    const netIncome = pickNum(o.netIncome);
    if (!date || revenue == null || netIncome == null) continue;
    out.push({
      date,
      revenue,
      grossProfit: pickNum(o.grossProfit),
      operatingExpenses: pickNum(o.operatingExpenses),
      netIncome,
      operatingIncome: pickNum(o.operatingIncome),
      dilutedEps: pickNum(o.dilutedEps ?? o.eps),
      dilutedAverageShares: pickNum(o.dilutedAverageShares),
    });
  }
  return out;
}

function parseCashFlowQuarters(parsed: unknown): ParsedCashFlowQ[] {
  if (!parsed || typeof parsed !== "object") return [];
  const arr = (parsed as Record<string, unknown>).cashFlowQuarterly;
  if (!Array.isArray(arr)) return [];
  const out: ParsedCashFlowQ[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const date = isoDate(o.date ?? o.periodEnd);
    const ocf = pickNum(o.operatingCashFlow);
    if (!date || ocf == null) continue;
    out.push({
      date,
      operatingCashFlow: ocf,
      capitalExpenditure: pickNum(o.capitalExpenditure),
      freeCashFlow: pickNum(o.freeCashFlow),
    });
  }
  return out;
}

/**
 * Validate proposed quarters per fiscal year against the bundle's annual rows and
 * merge the accepted ones (new dates only). Exported for unit tests.
 * Returns the number of income quarters added.
 */
export function mergeValidatedBackfill(bundle: StockAnalysisBundle, parsed: unknown): number {
  const sym = bundle.quote.symbol.trim().toUpperCase();
  const windows = fiscalWindows(bundle);
  if (windows.length === 0) return 0;

  const annualByFy = new Map(bundle.income.map((r) => [r.fiscalYear, r]));
  const existingIncomeDates = new Set(bundle.incomeQuarterly.map((r) => r.date.slice(0, 10)));

  const candidates = parseIncomeQuarters(parsed);
  const byWindow = new Map<string, ParsedIncomeQ[]>();
  for (const q of candidates) {
    const w = windows.find((win) => q.date > win.start && q.date <= win.end);
    if (!w) continue; // outside filed fiscal years — cannot be verified, drop
    const list = byWindow.get(w.fiscalYear) ?? [];
    list.push(q);
    byWindow.set(w.fiscalYear, list);
  }

  const acceptedIncome: IncomeStatementQuarter[] = [];
  const acceptedYears = new Set<string>();
  for (const [fy, qs] of byWindow) {
    const annual = annualByFy.get(fy);
    if (!annual || qs.length !== 4) continue;
    const revSum = qs.reduce((s, q) => s + q.revenue, 0);
    const niSum = qs.reduce((s, q) => s + q.netIncome, 0);
    if (!withinTolerance(revSum, annual.revenue, REVENUE_TOLERANCE)) continue;
    if (annual.netIncome !== 0 && !withinTolerance(niSum, annual.netIncome, NET_INCOME_TOLERANCE)) {
      continue;
    }
    acceptedYears.add(fy);
    for (const q of qs) {
      if (existingIncomeDates.has(q.date)) continue;
      acceptedIncome.push({
        date: q.date,
        symbol: sym,
        revenue: q.revenue,
        grossProfit: q.grossProfit ?? 0,
        operatingExpenses: q.operatingExpenses ?? 0,
        netIncome: q.netIncome,
        operatingIncome: q.operatingIncome ?? undefined,
        dilutedEps: q.dilutedEps ?? undefined,
        dilutedAverageShares: q.dilutedAverageShares ?? undefined,
      });
    }
  }

  if (acceptedIncome.length === 0) return 0;

  // Cash-flow quarters ride along only inside income-validated years and only
  // when their OCF also reconciles with the filed annual OCF.
  const annualCfByFy = new Map(bundle.cashFlow.map((r) => [r.fiscalYear, r]));
  const existingCfDates = new Set(bundle.cashFlowQuarterly.map((r) => r.date.slice(0, 10)));
  const cfCandidates = parseCashFlowQuarters(parsed);
  const cfByWindow = new Map<string, ParsedCashFlowQ[]>();
  for (const q of cfCandidates) {
    const w = windows.find((win) => q.date > win.start && q.date <= win.end);
    if (!w || !acceptedYears.has(w.fiscalYear)) continue;
    const list = cfByWindow.get(w.fiscalYear) ?? [];
    list.push(q);
    cfByWindow.set(w.fiscalYear, list);
  }

  const acceptedCf: CashFlowQuarter[] = [];
  for (const [fy, qs] of cfByWindow) {
    const annual = annualCfByFy.get(fy);
    const annualOcf = annual?.operatingCashFlow;
    if (annualOcf == null || qs.length !== 4) continue;
    const ocfSum = qs.reduce((s, q) => s + q.operatingCashFlow, 0);
    if (!withinTolerance(ocfSum, annualOcf, NET_INCOME_TOLERANCE)) continue;
    for (const q of qs) {
      if (existingCfDates.has(q.date)) continue;
      const capex = q.capitalExpenditure != null ? -Math.abs(q.capitalExpenditure) : null;
      acceptedCf.push({
        date: q.date,
        symbol: sym,
        freeCashFlow:
          q.freeCashFlow ?? (capex != null ? q.operatingCashFlow + capex : q.operatingCashFlow),
        operatingCashFlow: q.operatingCashFlow,
        capitalExpenditure: capex,
        investingCashFlow: null,
        financingCashFlow: null,
        dividendsPaid: null,
        stockRepurchase: null,
      });
    }
  }

  bundle.incomeQuarterly = trimQuarterlyToMax(
    sortQuarterlyByDateAsc([...bundle.incomeQuarterly, ...acceptedIncome]),
    FUNDAMENTALS_MAX_QUARTERS,
  );
  const aligned = alignQuarterlyToIncome(
    sym,
    bundle.incomeQuarterly,
    sortQuarterlyByDateAsc([...bundle.cashFlowQuarterly, ...acceptedCf]),
    bundle.balanceSheetQuarterly,
    bundle.dividendQuarterly,
  );
  bundle.cashFlowQuarterly = aligned.cashFlowQuarterly;
  bundle.balanceSheetQuarterly = aligned.balanceSheetQuarterly;
  bundle.dividendQuarterly = aligned.dividendQuarterly;

  return acceptedIncome.length;
}

function buildBackfillPrompt(bundle: StockAnalysisBundle): string {
  const sym = bundle.quote.symbol.trim().toUpperCase();
  const today = new Date().toISOString().slice(0, 10);
  const anchors = bundle.income
    .map((r) => `FY${r.fiscalYear} (ended ${r.date.slice(0, 10)}): revenue ${r.revenue}, netIncome ${r.netIncome}`)
    .join("\n");
  const existing = bundle.incomeQuarterly.map((r) => r.date.slice(0, 10)).join(", ") || "none";

  return `You output ONE JSON object (no markdown) with historical QUARTERLY fundamentals for ${sym}.
Today (UTC): ${today}.

The annual figures below come from official filings and are authoritative. Your quarterly
figures for a fiscal year MUST sum to these annual totals — quarters that do not reconcile
will be rejected automatically:
${anchors}

Rules:
- Only include quarters you are confident in, exactly as publicly reported (press releases /
  interim reports). If you are not sure about a quarter or a field, OMIT it — do not estimate.
- Amounts in the same currency and absolute scale as the annual anchors above (not thousands/millions).
- Cover the fiscal years listed above. Skip quarters ending after ${today}.
- These quarter end dates already exist and must NOT be included: ${existing}

JSON shape:
{
  "incomeQuarterly": [
    { "date": "YYYY-MM-DD", "revenue": N, "grossProfit": N, "operatingExpenses": N,
      "netIncome": N, "operatingIncome": N, "dilutedEps": N, "dilutedAverageShares": N }
  ],
  "cashFlowQuarterly": [
    { "date": "YYYY-MM-DD", "operatingCashFlow": N, "capitalExpenditure": N, "freeCashFlow": N }
  ]
}`;
}

/**
 * One Gemini call (throttled by the caller's gap-fill cooldown) proposing older
 * quarters; only annual-reconciled fiscal years are merged.
 */
export async function backfillQuarterlyHistoryFromGemini(
  bundle: StockAnalysisBundle,
): Promise<void> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return;
  if (!quarterlyHistoryIsThin(bundle)) return;
  if (bundle.income.length === 0) return;

  try {
    const raw = await callGeminiJson(
      apiKey,
      defaultGeminiModel(),
      buildBackfillPrompt(bundle),
      8192,
    );
    const added = mergeValidatedBackfill(bundle, raw);
    if (added > 0) {
      console.log(`[gemini quarterly backfill] ${bundle.quote.symbol}: +${added} validated quarters`);
    }
  } catch (e) {
    console.warn("[gemini quarterly backfill]", e instanceof Error ? e.message : e);
  }
}
