import OpenAI from "openai";
import YahooFinance from "yahoo-finance2";
import { NextResponse } from "next/server";

import { loadStockAnalysis } from "@/lib/stockAnalysisLoader";

export const maxDuration = 60;

const yahooFinance = new YahooFinance();

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 503 },
    );
  }

  let body: { ticker?: string };
  try {
    body = (await request.json()) as { ticker?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const ticker = body.ticker?.trim().toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "ticker is required." }, { status: 400 });
  }

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
  const metricsBlock = [
    `Market cap: ${inv.marketCap}`,
    `P/E trailing / forward: ${inv.trailingPE} / ${inv.forwardPE}`,
    `Margins (gross / operating / net): ${inv.grossMargins} / ${inv.operatingMargins} / ${inv.profitMargins}`,
    `Debt to equity: ${inv.debtToEquity}`,
    `Dividend yield: ${inv.dividendYield}`,
    `Beta: ${inv.beta}`,
  ].join("\n");

  const prompt = `You are a concise equity analyst. Company: ${bundle.quote.name} (${bundle.quote.symbol}).

Business context (may be incomplete):
${businessContext}

Key metrics (Yahoo snapshot, not investment advice):
${metricsBlock}

Respond in markdown ONLY with this exact structure:
### Competitive advantages
- First point
- Second point
- Third point

### Investment risks
- First point
- Second point
- Third point

Use English. One short sentence per bullet. No extra sections.`;

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 600,
      temperature: 0.35,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!text) {
      return NextResponse.json({ error: "Empty model response." }, { status: 502 });
    }
    return NextResponse.json({ markdown: text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
