import { fetchGeminiValuationPatches, type ValuationPeriodContext } from "@/lib/geminiValuationGapFill";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { sortIncomeByYearAsc, sortQuarterlyByDateAsc } from "@/lib/stockAnalysisTypes";

export const maxDuration = 120;

function buildPeriodContexts(bundle: StockAnalysisBundle, freq: "annual" | "quarterly"): ValuationPeriodContext[] {
  if (freq === "annual") {
    return sortIncomeByYearAsc(bundle.income).map((r) => ({
      periodEnd: r.date.slice(0, 10),
      revenue: Number.isFinite(r.revenue) ? r.revenue : null,
      netIncome: Number.isFinite(r.netIncome) ? r.netIncome : null,
      dilutedEps: r.dilutedEps != null && Number.isFinite(r.dilutedEps) ? r.dilutedEps : null,
    }));
  }
  return sortQuarterlyByDateAsc(bundle.incomeQuarterly).map((r) => ({
    periodEnd: r.date.slice(0, 10),
    revenue: Number.isFinite(r.revenue) ? r.revenue : null,
    netIncome: Number.isFinite(r.netIncome) ? r.netIncome : null,
    dilutedEps: r.dilutedEps != null && Number.isFinite(r.dilutedEps) ? r.dilutedEps : null,
  }));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const o = body as {
    ticker?: string;
    bundle?: StockAnalysisBundle;
    freq?: string;
    needingFill?: unknown;
  };
  const ticker = typeof o.ticker === "string" ? o.ticker.trim() : "";
  if (!ticker || !o.bundle) {
    return Response.json({ error: "ticker and bundle are required" }, { status: 400 });
  }

  const freq = o.freq === "annual" ? "annual" : "quarterly";
  const needingFill = Array.isArray(o.needingFill)
    ? o.needingFill.filter((x): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}/.test(x.trim()))
    : [];

  const periods = buildPeriodContexts(o.bundle, freq);

  try {
    const patches = await fetchGeminiValuationPatches(ticker, periods, needingFill);
    const count = Object.keys(patches).length;
    return Response.json({ ok: true, patches, filled: count });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gemini valuation fill failed";
    return Response.json({ error: msg, ok: false }, { status: 500 });
  }
}
