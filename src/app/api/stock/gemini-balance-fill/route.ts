import { applyGeminiBalanceSheetGaps } from "@/lib/geminiBalanceSheetGapFill";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

export const maxDuration = 120;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const o = body as { ticker?: string; bundle?: StockAnalysisBundle; focusPeriodEnds?: unknown };
  const ticker = typeof o.ticker === "string" ? o.ticker.trim() : "";
  if (!ticker || !o.bundle) {
    return Response.json({ error: "ticker and bundle are required" }, { status: 400 });
  }

  const focusPeriodEnds = Array.isArray(o.focusPeriodEnds)
    ? o.focusPeriodEnds.filter((x): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}/.test(x.trim()))
    : undefined;

  const bundle = JSON.parse(JSON.stringify(o.bundle)) as StockAnalysisBundle;
  try {
    const ok = await applyGeminiBalanceSheetGaps(ticker, bundle, { focusPeriodEnds });
    return Response.json({ ok, bundle, filled: ok });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gemini balance fill failed";
    return Response.json({ error: msg, ok: false }, { status: 500 });
  }
}
