import OpenAI from "openai";
import YahooFinance from "yahoo-finance2";
import { NextResponse } from "next/server";

import { geminiGenerateText, getGeminiApiKey } from "@/lib/geminiClient";
import { loadStockAnalysis } from "@/lib/stockAnalysisLoader";
import {
  buildAiFundamentalsTableText,
  describePeriodForAi,
} from "@/lib/stockAiFundamentalsText";
import { INVALID_TICKER_SYMBOL_MESSAGE, isValidStockSymbolInput } from "@/lib/stockSymbol";
import type { ChartTimeRange, FundamentalsFreq } from "@/lib/stockPeriodCore";

export const maxDuration = 60;

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function parseTimeRange(v: unknown): ChartTimeRange {
  const s = String(v ?? "3y");
  if (s === "10y" || s === "5y" || s === "3y" || s === "1y" || s === "custom") return s;
  return "3y";
}

function parseFreq(v: unknown): FundamentalsFreq {
  return String(v ?? "quarterly") === "annual" ? "annual" : "quarterly";
}

type AiBody = {
  ticker?: string;
  timeRange?: unknown;
  freq?: unknown;
  customFromYear?: number | null;
  customToYear?: number | null;
  locale?: unknown;
};

export async function POST(request: Request) {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = getGeminiApiKey();

  if (!openaiKey && !geminiKey) {
    return NextResponse.json(
      { error: "Configure OPENAI_API_KEY or GEMINI_API_KEY for AI analysis." },
      { status: 503 },
    );
  }

  let body: AiBody;
  try {
    body = (await request.json()) as AiBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const raw = body.ticker?.trim() ?? "";
  if (!raw) {
    return NextResponse.json({ error: "ticker is required." }, { status: 400 });
  }
  if (!isValidStockSymbolInput(raw)) {
    return NextResponse.json({ error: INVALID_TICKER_SYMBOL_MESSAGE }, { status: 400 });
  }
  const ticker = raw.toUpperCase();

  const timeRange = parseTimeRange(body.timeRange);
  const freq = parseFreq(body.freq);
  const customFromYear =
    typeof body.customFromYear === "number" && Number.isFinite(body.customFromYear)
      ? body.customFromYear
      : null;
  const customToYear =
    typeof body.customToYear === "number" && Number.isFinite(body.customToYear)
      ? body.customToYear
      : null;
  const locale = String(body.locale ?? "en") === "bg" ? "bg" : "en";

  const { bundle, error } = await loadStockAnalysis(ticker);
  if (!bundle || error) {
    return NextResponse.json({ error: error ?? "Could not load symbol." }, { status: 404 });
  }

  let businessContext = bundle.quote.name;
  try {
    const qs = await yahooFinance.quoteSummary(ticker, {
      modules: ["summaryProfile", "assetProfile"],
    });
    const sp = qs.summaryProfile as
      | { longBusinessSummary?: string; sector?: string; industry?: string }
      | undefined;
    const parts = [sp?.sector, sp?.industry, sp?.longBusinessSummary].filter(
      (x): x is string => typeof x === "string" && x.length > 0,
    );
    if (parts.length > 0) {
      businessContext = parts.join("\n\n").slice(0, 6000);
    }
  } catch {
    /* optional */
  }

  const inv = bundle.investor;
  const q = bundle.quote;
  const metricsBlock = [
    `Market cap: ${inv.marketCap}`,
    `P/E trailing / forward: ${inv.trailingPE} / ${inv.forwardPE}`,
    `Margins (gross / operating / net): ${inv.grossMargins} / ${inv.operatingMargins} / ${inv.profitMargins}`,
    `Debt to equity: ${inv.debtToEquity}`,
    `Dividend yield: ${inv.dividendYield}`,
    `Beta: ${inv.beta}`,
    `Currency (headline): ${inv.currency ?? "n/a"}`,
  ].join("\n");

  const periodDesc = describePeriodForAi(timeRange, freq, customFromYear, customToYear);
  const fundamentalsTable = buildAiFundamentalsTableText(bundle, {
    freq,
    timeRange,
    customFromYear,
    customToYear,
  });

  const langLine =
    locale === "bg"
      ? "Write the entire report in Bulgarian."
      : "Write the entire report in English.";

  const prompt = `You are an equity research assistant. Produce a short markdown report for ${bundle.quote.name} (${bundle.quote.symbol}).

${langLine}

**Critical:** Base numerical commentary ONLY on the "Fundamentals table" and live quote below. Those rows match the user's screen filters (${periodDesc}). Do not invent fiscal periods or figures that are not in the table. If the table is short or sparse, say so.

## Live quote
- Price: ${q.price}, change: ${q.change} (${q.changesPercentage}%)
- Symbol: ${q.symbol}

## Business context (may be incomplete)
${businessContext}

## Investor snapshot (headline; same order of magnitude as screens)
${metricsBlock}

## Fundamentals table (${freq}, filters: ${periodDesc})
Pipe-separated rows; amounts are scaled (K/M/B/T). Rev/NI growth columns are period-over-period % for the selected granularity.
${fundamentalsTable}

Respond in markdown with EXACTLY these sections and headings:
### Summary
2–4 sentences.

### What the filtered data shows
3–6 bullets referencing specific periods/labels from the table (e.g. FY 2023, Mar 24).

### Risks and data caveats
2–4 bullets (missing periods, possible restatements, currency, model-generated fundamentals disclaimer).

### Competitive positioning
2–4 bullets tied to the business context only where grounded; no fabricated numbers.

No other top-level sections. One sentence per bullet. Not investment advice.`;

  if (geminiKey) {
    const g = await geminiGenerateText({
      prompt,
      maxOutputTokens: 2048,
      temperature: 0.35,
      timeoutMs: 55_000,
    });
    if (g.ok) {
      const text = g.text.trim();
      if (text.length > 0) {
        return NextResponse.json({ markdown: text, provider: "gemini" as const });
      }
      if (!openaiKey) {
        return NextResponse.json({ error: "Empty Gemini response." }, { status: 502 });
      }
    } else if (!openaiKey) {
      const err =
        g.error === "http"
          ? `Gemini error${g.status != null ? ` (${g.status})` : ""}.`
          : g.error === "network"
            ? "Gemini request failed (network)."
            : g.error === "empty"
              ? "Empty Gemini response."
              : "Gemini request failed.";
      return NextResponse.json({ error: err }, { status: 502 });
    }
    /* Gemini empty/failed but OpenAI configured — fall through */
  }

  if (openaiKey) {
    try {
      const openai = new OpenAI({ apiKey: openaiKey });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1200,
        temperature: 0.35,
      });
      const text = completion.choices[0]?.message?.content?.trim() ?? "";
      if (!text) {
        return NextResponse.json({ error: "Empty model response." }, { status: 502 });
      }
      return NextResponse.json({ markdown: text, provider: "openai" as const });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "OpenAI request failed.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "No AI provider available." }, { status: 503 });
}
