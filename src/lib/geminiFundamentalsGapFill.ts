/**
 * Optional: Gemini suggests values for missing quarterly cash-flow fields (nulls only).
 * On by default when GEMINI_API_KEY is set; disable with GEMINI_FILL_FUNDAMENTALS=0.
 */

import { defaultGeminiModel, getGeminiApiKey } from "@/lib/geminiClient";
import type { CashFlowQuarter, StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

const MAX_QUARTERS_IN_PROMPT = 28;

function geminiGapFillEnabled(): boolean {
  if (!getGeminiApiKey()) return false;
  const v = process.env.GEMINI_FILL_FUNDAMENTALS?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

function parseJsonFromGemini(text: string): unknown {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  const raw = fence ? fence[1].trim() : t;
  return JSON.parse(raw);
}

function saneNumber(n: unknown, maxAbs = 5e14): number | null {
  if (n == null) return null;
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || Math.abs(v) > maxAbs) return null;
  return v;
}

type GeminiQuarterPatch = {
  periodEnd?: string;
  operatingCashFlow?: number | null;
  capitalExpenditure?: number | null;
  investingCashFlow?: number | null;
  financingCashFlow?: number | null;
  dividendsPaid?: number | null;
  stockRepurchase?: number | null;
};

type GeminiResponse = {
  quarters?: GeminiQuarterPatch[];
};

/**
 * When many quarterly cash-flow fields are still null after Yahoo/SEC, optionally ask Gemini for JSON patches.
 * Merges into null fields only.
 */
export async function applyGeminiFundamentalGaps(
  symbol: string,
  bundle: StockAnalysisBundle,
): Promise<void> {
  if (!geminiGapFillEnabled()) return;

  const sym = symbol.trim().toUpperCase();
  const inc = bundle.incomeQuarterly;
  const cf = bundle.cashFlowQuarterly;
  if (inc.length === 0 || inc.length !== cf.length) return;

  const gaps: { periodEnd: string; missing: string[] }[] = [];

  for (let i = 0; i < inc.length; i++) {
    const d = inc[i].date.slice(0, 10);
    const rowCf = cf[i];
    const missing: string[] = [];
    if (rowCf.operatingCashFlow == null) missing.push("operatingCashFlow");
    if (rowCf.capitalExpenditure == null) missing.push("capitalExpenditure");
    if (rowCf.investingCashFlow == null) missing.push("investingCashFlow");
    if (rowCf.financingCashFlow == null) missing.push("financingCashFlow");
    if (rowCf.dividendsPaid == null) missing.push("dividendsPaid");
    if (rowCf.stockRepurchase == null) missing.push("stockRepurchase");
    if (missing.length > 0) gaps.push({ periodEnd: d, missing: [...new Set(missing)] });
  }

  const gapRatio = gaps.length / Math.max(inc.length, 1);
  if (gaps.length === 0) return;
  if (gaps.length < 3 && gapRatio < 0.05) return;

  const tailGaps = gaps.slice(-MAX_QUARTERS_IN_PROMPT);
  const tailDates = new Set(tailGaps.map((g) => g.periodEnd));

  const apiKey = getGeminiApiKey()!;
  const model = defaultGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const prompt = `You help fill NULL cash-flow fields in a US stock fundamentals pipeline. Yahoo Finance and SEC EDGAR were already used; some quarterly cash flow lines are still null.

Ticker: ${sym}
Return ONLY valid JSON with this exact shape (no markdown fences):
{"quarters":[{"periodEnd":"YYYY-MM-DD","operatingCashFlow":number|null,"capitalExpenditure":number|null,"investingCashFlow":number|null,"financingCashFlow":number|null,"dividendsPaid":number|null,"stockRepurchase":number|null}]}

Rules:
- One object per periodEnd below. Use null unless you are confident the number matches public GAAP filings (10-Q/10-K) for that period.
- Amounts in USD as in filings (company scale, not per share).
- Never invent numbers to look plausible — prefer null.

Periods and missing fields:
${JSON.stringify(tailGaps)}`;

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
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e) {
    console.error("[geminiFundamentalsGapFill] request failed", e);
    return;
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error("[geminiFundamentalsGapFill] HTTP", res.status, errText.slice(0, 500));
    return;
  }

  const raw = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    raw?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("")?.trim() ?? "";
  if (!text) return;

  let parsed: GeminiResponse;
  try {
    const tryParse = parseJsonFromGemini(text) as Record<string, unknown> | unknown[];
    if (Array.isArray(tryParse)) {
      parsed = { quarters: tryParse as GeminiQuarterPatch[] };
    } else {
      parsed = tryParse as GeminiResponse;
    }
  } catch {
    console.error("[geminiFundamentalsGapFill] JSON parse failed", text.slice(0, 400));
    return;
  }

  const patches = parsed.quarters;
  if (!Array.isArray(patches) || patches.length === 0) return;

  const byDate = new Map<string, GeminiQuarterPatch>();
  for (const p of patches) {
    const pe = p.periodEnd?.slice(0, 10);
    if (pe && tailDates.has(pe)) byDate.set(pe, p);
  }

  const newCf: CashFlowQuarter[] = cf.map((r) => ({ ...r }));

  for (let i = 0; i < inc.length; i++) {
    const d = inc[i].date.slice(0, 10);
    const patch = byDate.get(d);
    if (!patch) continue;

    const p = patch;
    const c = newCf[i];
    if (c.operatingCashFlow == null && saneNumber(p.operatingCashFlow) != null) {
      c.operatingCashFlow = saneNumber(p.operatingCashFlow);
    }
    if (c.capitalExpenditure == null && saneNumber(p.capitalExpenditure) != null) {
      c.capitalExpenditure = saneNumber(p.capitalExpenditure);
    }
    if (c.investingCashFlow == null && saneNumber(p.investingCashFlow) != null) {
      c.investingCashFlow = saneNumber(p.investingCashFlow);
    }
    if (c.financingCashFlow == null && saneNumber(p.financingCashFlow) != null) {
      c.financingCashFlow = saneNumber(p.financingCashFlow);
    }
    if (c.dividendsPaid == null && saneNumber(p.dividendsPaid) != null) {
      c.dividendsPaid = saneNumber(p.dividendsPaid);
    }
    if (c.stockRepurchase == null && saneNumber(p.stockRepurchase) != null) {
      c.stockRepurchase = saneNumber(p.stockRepurchase);
    }

    const ocf = c.operatingCashFlow;
    const capex = c.capitalExpenditure;
    if (ocf != null && capex != null && Number.isFinite(ocf) && Number.isFinite(capex)) {
      c.freeCashFlow = ocf + capex;
    } else if (ocf != null && Number.isFinite(ocf)) {
      c.freeCashFlow = ocf;
    }
  }

  bundle.cashFlowQuarterly = newCf;
}
