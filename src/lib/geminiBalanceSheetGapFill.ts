/**
 * On-demand: Gemini suggests balance-sheet line items when Yahoo fundamentalsTimeSeries
 * returns nulls (common for IFRS naming, delayed filings, or API gaps).
 * Also fills quarterly dividendPerShare when Yahoo omits DPS but the company pays dividends,
 * and inventory (needed for quick ratio ≈ (current assets − inventory) / current liabilities).
 * Merges into null fields only; caller should show an illustrative disclaimer.
 */

import { defaultGeminiModel, getGeminiApiKey } from "@/lib/geminiClient";
import type {
  BalanceSheetAnnual,
  BalanceSheetQuarter,
  DividendQuarterlyPoint,
  StockAnalysisBundle,
} from "@/lib/stockAnalysisTypes";

export type GeminiBalanceFillOptions = {
  /**
   * ISO period-end dates (YYYY-MM-DD) from the chart range the user selected (annual or quarterly rows).
   * Gemini is instructed to prioritize filings for these periods.
   */
  focusPeriodEnds?: string[];
};

function saneNumber(n: unknown, maxAbs = 5e14): number | null {
  if (n == null) return null;
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || Math.abs(v) > maxAbs) return null;
  return v;
}

/** Per-share dividend for one quarter — guardrails vs balance-sheet scale mistakes. */
function saneDividendPerShare(n: unknown): number | null {
  if (n == null) return null;
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < 0 || v > 50) return null;
  return v;
}

function parseJsonFromGemini(text: string): unknown {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  const raw = fence ? fence[1].trim() : t;
  return JSON.parse(raw);
}

type AnnualPatch = {
  fiscalYear?: string;
  totalAssets?: number | null;
  totalDebt?: number | null;
  netDebt?: number | null;
  stockholdersEquity?: number | null;
  cashAndCashEquivalents?: number | null;
  totalCurrentAssets?: number | null;
  totalCurrentLiabilities?: number | null;
  inventory?: number | null;
};

type QuarterlyPatch = {
  periodEnd?: string;
  totalAssets?: number | null;
  totalDebt?: number | null;
  netDebt?: number | null;
  stockholdersEquity?: number | null;
  cashAndCashEquivalents?: number | null;
  totalCurrentAssets?: number | null;
  totalCurrentLiabilities?: number | null;
  inventory?: number | null;
};

type DividendPatch = {
  date?: string;
  dividendPerShare?: number | null;
};

type GeminiBsResponse = {
  annual?: AnnualPatch[];
  quarterly?: QuarterlyPatch[];
  dividends?: DividendPatch[];
};

function bsNeedsGapFill(bundle: StockAnalysisBundle): boolean {
  const rowGap = (r: BalanceSheetAnnual | BalanceSheetQuarter) =>
    r.totalAssets == null || r.stockholdersEquity == null || r.totalDebt == null;

  const quickRatioGap = (r: BalanceSheetAnnual | BalanceSheetQuarter) => {
    const tca = r.totalCurrentAssets;
    const tcl = r.totalCurrentLiabilities;
    if (tca == null || tcl == null) return true;
    if (r.inventory == null) return true;
    return false;
  };

  if (bundle.balanceSheet.some((r) => rowGap(r) || quickRatioGap(r))) return true;
  if (bundle.balanceSheetQuarterly.some((r) => rowGap(r) || quickRatioGap(r))) return true;
  return false;
}

function dividendNeedsGapFill(bundle: StockAnalysisBundle): boolean {
  const tail = bundle.dividendQuarterly.slice(-20);
  if (!tail.some((p) => p.dividendPerShare == null)) return false;
  const inv = bundle.investor;
  const pays =
    (inv.dividendRate != null && inv.dividendRate > 0) ||
    (inv.dividendYield != null && inv.dividendYield > 1e-8) ||
    bundle.dividendQuarterly.some((p) => p.dividendPerShare != null && p.dividendPerShare > 0);
  return pays;
}

function defaultFocusPeriodEnds(bundle: StockAnalysisBundle): string[] {
  const q = bundle.balanceSheetQuarterly.slice(-16).map((r) => r.date.slice(0, 10));
  const a = bundle.balanceSheet.slice(-8).map((r) => r.date.slice(0, 10));
  return [...new Set([...q, ...a])];
}

/**
 * Returns true if any numeric field was filled.
 */
export async function applyGeminiBalanceSheetGaps(
  symbol: string,
  bundle: StockAnalysisBundle,
  options?: GeminiBalanceFillOptions,
): Promise<boolean> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return false;

  const sym = symbol.trim().toUpperCase();
  const needsBs = bsNeedsGapFill(bundle);
  const needsDiv = dividendNeedsGapFill(bundle);

  if (!needsBs && !needsDiv) return false;

  const focusRaw = options?.focusPeriodEnds?.length
    ? options.focusPeriodEnds
    : defaultFocusPeriodEnds(bundle);
  const focusPeriodEnds = [...new Set(focusRaw.map((d) => d.slice(0, 10)))].sort();

  const incSummary = bundle.income.map((r) => ({
    fiscalYear: r.fiscalYear,
    revenue: r.revenue,
    netIncome: r.netIncome,
  }));
  const bsAnnualSummary = bundle.balanceSheet.map((r) => ({
    fiscalYear: r.fiscalYear,
    totalAssets: r.totalAssets,
    totalDebt: r.totalDebt,
    netDebt: r.netDebt,
    stockholdersEquity: r.stockholdersEquity,
    cashAndCashEquivalents: r.cashAndCashEquivalents,
    totalCurrentAssets: r.totalCurrentAssets,
    totalCurrentLiabilities: r.totalCurrentLiabilities,
    inventory: r.inventory,
  }));

  const model = defaultGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const divTail = bundle.dividendQuarterly.slice(-24).map((r) => ({
    date: r.date.slice(0, 10),
    dividendPerShare: r.dividendPerShare,
  }));

  const prompt = `You help fill NULL fields for a stock fundamentals UI. Yahoo Finance time series often omits line items (IFRS vs US GAAP labels, timing). Use widely reported 10-K / 10-Q figures when you are confident.

Ticker: ${sym}

**Priority periods (match fiscal quarter/year ends to these dates when possible):**
${JSON.stringify(focusPeriodEnds)}

Return ONLY valid JSON (no markdown) with this shape:
{"annual":[{"fiscalYear":"2023","totalAssets":number|null,...,"inventory":number|null}],"quarterly":[{"periodEnd":"YYYY-MM-DD",...same BS fields including inventory}],"dividends":[{"date":"YYYY-MM-DD","dividendPerShare":number|null}]}

Rules:
- Amounts for balance sheet: same currency scale as public filings (company reporting currency), not per share.
- **inventory** (and totalCurrentAssets, totalCurrentLiabilities): needed for quick ratio (current assets − inventory) / current liabilities. If Yahoo left inventory null but current assets/liabilities exist, fill inventory from the same filing when possible (use null if not in the filing).
- **dividends**: dividendPerShare is USD per share for the fiscal quarter ending on \`date\` (sum of declared dividends with ex-dates falling in that fiscal quarter window, consistent with US large-cap 10-Q practice). Only include dividend objects for quarters that still have null dividendPerShare in the input and where the company paid a dividend — use null if no payment.
- Prefer null over guessing. Only fill when typical 10-K/10-Q values are stable in public sources.
- Include one annual object per fiscal year listed below that still has nulls in any required field; include quarterly objects for period ends listed below that still have nulls.
- Include **dividends** array only when ${needsDiv ? "the quarterly dividend rows below have nulls and the company pays dividends" : "not needed — use []"}.

Annual income (context):
${JSON.stringify(incSummary.slice(-12))}

Current annual balance sheet (null = missing from Yahoo):
${JSON.stringify(bsAnnualSummary.slice(-12))}

Quarterly period ends (last 12 rows, BS — null = missing):
${JSON.stringify(
    bundle.balanceSheetQuarterly.slice(-12).map((r) => ({
      periodEnd: r.date.slice(0, 10),
      totalAssets: r.totalAssets,
      totalDebt: r.totalDebt,
      stockholdersEquity: r.stockholdersEquity,
      cashAndCashEquivalents: r.cashAndCashEquivalents,
      totalCurrentAssets: r.totalCurrentAssets,
      totalCurrentLiabilities: r.totalCurrentLiabilities,
      inventory: r.inventory,
    })),
  )}

Quarterly dividend per share (null = Yahoo omitted — fill via dividends[] when appropriate):
${JSON.stringify(divTail)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.15,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    console.error("[geminiBalanceSheetGapFill] request failed", e);
    return false;
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error("[geminiBalanceSheetGapFill] HTTP", res.status, errText.slice(0, 500));
    return false;
  }

  const raw = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    raw?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("")?.trim() ?? "";
  if (!text) return false;

  let parsed: GeminiBsResponse;
  try {
    parsed = parseJsonFromGemini(text) as GeminiBsResponse;
  } catch (e) {
    console.error("[geminiBalanceSheetGapFill] JSON parse failed", e, text.slice(0, 400));
    return false;
  }

  let filled = false;

  const annByFy = new Map<string, AnnualPatch>();
  for (const p of parsed.annual ?? []) {
    const fy = p.fiscalYear?.trim();
    if (fy) annByFy.set(fy, p);
  }

  const patchAnnual = (row: BalanceSheetAnnual, p: AnnualPatch): BalanceSheetAnnual => {
    let out = row;
    const set = (field: keyof BalanceSheetAnnual, v: unknown, fn: typeof saneNumber = saneNumber) => {
      if (row[field] != null) return;
      const n = fn(v);
      if (n == null) return;
      if (out === row) out = { ...row };
      (out as Record<string, unknown>)[field] = n;
      filled = true;
    };
    set("totalAssets", p.totalAssets);
    set("totalDebt", p.totalDebt);
    set("netDebt", p.netDebt);
    set("stockholdersEquity", p.stockholdersEquity);
    set("cashAndCashEquivalents", p.cashAndCashEquivalents);
    set("totalCurrentAssets", p.totalCurrentAssets);
    set("totalCurrentLiabilities", p.totalCurrentLiabilities);
    set("inventory", p.inventory);
    return out;
  };

  const newAnnual: BalanceSheetAnnual[] = bundle.balanceSheet.map((row) => {
    const p = annByFy.get(row.fiscalYear);
    if (!p) return row;
    return patchAnnual(row, p);
  });

  const qByDate = new Map<string, QuarterlyPatch>();
  for (const p of parsed.quarterly ?? []) {
    const d = p.periodEnd?.slice(0, 10);
    if (d) qByDate.set(d, p);
  }

  const patchQ = (row: BalanceSheetQuarter, p: QuarterlyPatch): BalanceSheetQuarter => {
    let out = row;
    const set = (field: keyof BalanceSheetQuarter, v: unknown, fn: typeof saneNumber = saneNumber) => {
      if (row[field] != null) return;
      const n = fn(v);
      if (n == null) return;
      if (out === row) out = { ...row };
      (out as Record<string, unknown>)[field] = n;
      filled = true;
    };
    set("totalAssets", p.totalAssets);
    set("totalDebt", p.totalDebt);
    set("netDebt", p.netDebt);
    set("stockholdersEquity", p.stockholdersEquity);
    set("cashAndCashEquivalents", p.cashAndCashEquivalents);
    set("totalCurrentAssets", p.totalCurrentAssets);
    set("totalCurrentLiabilities", p.totalCurrentLiabilities);
    set("inventory", p.inventory);
    return out;
  };

  const newQ: BalanceSheetQuarter[] = bundle.balanceSheetQuarterly.map((row) => {
    const p = qByDate.get(row.date.slice(0, 10));
    if (!p) return row;
    return patchQ(row, p);
  });

  const divByDate = new Map<string, DividendPatch>();
  for (const p of parsed.dividends ?? []) {
    const d = p.date?.slice(0, 10);
    if (d) divByDate.set(d, p);
  }

  const newDividend: DividendQuarterlyPoint[] = bundle.dividendQuarterly.map((row) => {
    if (row.dividendPerShare != null) return row;
    const p = divByDate.get(row.date.slice(0, 10));
    if (!p) return row;
    const dps = saneDividendPerShare(p.dividendPerShare);
    if (dps == null) return row;
    filled = true;
    return { ...row, dividendPerShare: dps };
  });

  if (!filled) return false;

  bundle.balanceSheet = newAnnual;
  bundle.balanceSheetQuarterly = newQ;
  bundle.dividendQuarterly = newDividend;
  return true;
}
