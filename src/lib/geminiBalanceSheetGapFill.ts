/**
 * On-demand: Gemini suggests balance-sheet line items when Yahoo fundamentalsTimeSeries
 * returns nulls (common for IFRS naming, delayed filings, or API gaps).
 * Merges into null fields only; caller should show an illustrative disclaimer.
 */

import { defaultGeminiModel, getGeminiApiKey } from "@/lib/geminiClient";
import type {
  BalanceSheetAnnual,
  BalanceSheetQuarter,
  StockAnalysisBundle,
} from "@/lib/stockAnalysisTypes";

function saneNumber(n: unknown, maxAbs = 5e14): number | null {
  if (n == null) return null;
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || Math.abs(v) > maxAbs) return null;
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
};

type GeminiBsResponse = {
  annual?: AnnualPatch[];
  quarterly?: QuarterlyPatch[];
};

/**
 * Returns true if any numeric field was filled.
 */
export async function applyGeminiBalanceSheetGaps(symbol: string, bundle: StockAnalysisBundle): Promise<boolean> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return false;

  const sym = symbol.trim().toUpperCase();
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
  }));

  const needsFill =
    bundle.balanceSheet.some(
      (r) => r.totalAssets == null || r.stockholdersEquity == null || r.totalDebt == null,
    ) ||
    bundle.balanceSheetQuarterly.some(
      (r) => r.totalAssets == null || r.stockholdersEquity == null || r.totalDebt == null,
    );

  if (!needsFill) return false;

  const model = defaultGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const prompt = `You help fill NULL balance-sheet fields for a stock fundamentals UI. Yahoo Finance time series often omits or nulls line items (IFRS vs US GAAP labels, timing). Use widely reported 10-K / 10-Q figures when you are confident.

Ticker: ${sym}

Return ONLY valid JSON (no markdown) with this shape:
{"annual":[{"fiscalYear":"2023","totalAssets":number|null,"totalDebt":number|null,"netDebt":number|null,"stockholdersEquity":number|null,"cashAndCashEquivalents":number|null,"totalCurrentAssets":number|null,"totalCurrentLiabilities":number|null}],"quarterly":[{"periodEnd":"YYYY-MM-DD",...same fields...}]}

Rules:
- Amounts in the same currency scale as public filings (company reporting currency), not per share.
- Prefer null over guessing. Only fill when typical 10-K/10-Q values are stable in public sources.
- Include one annual object per fiscal year listed below that still has nulls; include quarterly objects for period ends listed below that still have nulls.

Annual income (context):
${JSON.stringify(incSummary.slice(-12))}

Current annual balance sheet (null = missing from Yahoo):
${JSON.stringify(bsAnnualSummary.slice(-12))}

Quarterly period ends with null-heavy BS (last 12 rows):
${JSON.stringify(
    bundle.balanceSheetQuarterly.slice(-12).map((r) => ({
      periodEnd: r.date.slice(0, 10),
      totalAssets: r.totalAssets,
      totalDebt: r.totalDebt,
      stockholdersEquity: r.stockholdersEquity,
      cashAndCashEquivalents: r.cashAndCashEquivalents,
      totalCurrentAssets: r.totalCurrentAssets,
      totalCurrentLiabilities: r.totalCurrentLiabilities,
    })),
  )}`;

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
    const set = (field: keyof BalanceSheetAnnual, v: unknown) => {
      if (row[field] != null) return;
      const n = saneNumber(v);
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
    const set = (field: keyof BalanceSheetQuarter, v: unknown) => {
      if (row[field] != null) return;
      const n = saneNumber(v);
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
    return out;
  };

  const newQ: BalanceSheetQuarter[] = bundle.balanceSheetQuarterly.map((row) => {
    const p = qByDate.get(row.date.slice(0, 10));
    if (!p) return row;
    return patchQ(row, p);
  });

  if (!filled) return false;

  bundle.balanceSheet = newAnnual;
  bundle.balanceSheetQuarterly = newQ;
  return true;
}
