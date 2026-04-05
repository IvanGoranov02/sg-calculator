import { defaultGeminiModel, getGeminiApiKey } from "@/lib/geminiClient";

function parseJsonFromGemini(text: string): unknown {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  const raw = fence ? fence[1].trim() : t;
  return JSON.parse(raw);
}

function saneRatio(n: unknown): number | null {
  if (n == null) return null;
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0 || v > 10_000) return null;
  return v;
}

export type ValuationPeriodContext = {
  periodEnd: string;
  revenue: number | null;
  netIncome: number | null;
  dilutedEps: number | null;
};

/**
 * Fills trailing P/E and P/S for periods where Yahoo price or TTM math left nulls.
 * Illustrative — merges only into client-side patch map, not audited filings.
 */
export async function fetchGeminiValuationPatches(
  symbol: string,
  periods: ValuationPeriodContext[],
  needingFill: string[],
): Promise<Record<string, { peTtm: number | null; psTtm: number | null }>> {
  const out: Record<string, { peTtm: number | null; psTtm: number | null }> = {};
  const apiKey = getGeminiApiKey();
  if (!apiKey || needingFill.length === 0) return out;

  const needSet = new Set(needingFill.map((d) => d.slice(0, 10)));
  const subset = periods.filter((p) => needSet.has(p.periodEnd.slice(0, 10)));
  if (subset.length === 0) return out;

  const sym = symbol.trim().toUpperCase();
  const model = defaultGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const prompt = `You help estimate market valuation ratios for a US-listed stock when automated Yahoo price × TTM fundamentals left gaps.

Ticker: ${sym}
Return ONLY valid JSON (no markdown fences):
{"periods":[{"periodEnd":"YYYY-MM-DD","peTtm":number|null,"psTtm":number|null}]}

Rules:
- One object per periodEnd listed below. peTtm = trailing P/E, psTtm = trailing price/sales, both dimensionless.
- Use null unless you can justify approximate values from public filings (10-K/10-Q) and typical market context for that period — never invent smooth fake series.
- If unsure, return null for both.

Periods to fill (financials from our pipeline, USD scale as reported):
${JSON.stringify(subset)}`;

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
          maxOutputTokens: 4096,
          temperature: 0.15,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch (e) {
    console.error("[geminiValuationGapFill] request failed", e);
    return out;
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error("[geminiValuationGapFill] HTTP", res.status, errText.slice(0, 400));
    return out;
  }

  const raw = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    raw?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("")?.trim() ?? "";
  if (!text) return out;

  let parsed: { periods?: Array<{ periodEnd?: string; peTtm?: unknown; psTtm?: unknown }> };
  try {
    parsed = parseJsonFromGemini(text) as typeof parsed;
  } catch (e) {
    console.error("[geminiValuationGapFill] JSON parse failed", e, text.slice(0, 400));
    return out;
  }

  for (const p of parsed.periods ?? []) {
    const d = typeof p.periodEnd === "string" ? p.periodEnd.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (!needSet.has(d)) continue;
    out[d] = {
      peTtm: saneRatio(p.peTtm),
      psTtm: saneRatio(p.psTtm),
    };
  }

  return out;
}
