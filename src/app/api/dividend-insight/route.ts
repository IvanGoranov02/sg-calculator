import { NextResponse } from "next/server";

/**
 * Short Gemini context when Yahoo quarterly DPS is missing in the UI.
 * @see https://ai.google.dev/gemini-api/docs
 * Default model: gemini-3.1-flash-lite-preview (fast / cost-efficient; override with GEMINI_MODEL).
 * @see https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-preview
 */
export async function GET(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "no_key" as const }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();
  const locale = searchParams.get("locale") === "bg" ? "bg" : "en";
  if (!ticker) {
    return NextResponse.json({ ok: false, error: "ticker" as const }, { status: 400 });
  }

  const name = searchParams.get("name")?.trim() ?? "";
  const divYield = searchParams.get("yield")?.trim() ?? "";
  const divRate = searchParams.get("rate")?.trim() ?? "";

  const lang = locale === "bg" ? "Bulgarian" : "English";
  const prompt = `You help investors understand missing dividend chart data in a stock dashboard. Data comes from Yahoo Finance; sometimes quarterly dividend per share is empty while headline yield exists.

Ticker: ${ticker}
Company name (if known): ${name}
Yahoo snapshot dividend yield (raw number, may be decimal fraction or percent depending on source): ${divYield || "unknown"}
Yahoo snapshot annual dividend rate per share (if any): ${divRate || "unknown"}

Write 2–4 short sentences in ${lang}. Explain plausible reasons the app may show no per-quarter DPS (timing, irregular/special dividends, sector patterns, REIT/MLP quirks, fiscal vs calendar alignment, API gaps). If the company is widely known for a clear dividend policy, you may mention it in general terms only — do NOT invent exact amounts, dates, or yields. End with one sentence that this is general information, not investment advice.`;

  const model =
    process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite-preview";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

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
        generationConfig: { maxOutputTokens: 400, temperature: 0.35 },
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e) {
    console.error("[dividend-insight] request failed", e);
    return NextResponse.json({ ok: false, error: "network" as const }, { status: 502 });
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error("[dividend-insight] Gemini HTTP", res.status, errText.slice(0, 800));
    return NextResponse.json({ ok: false, error: "upstream" as const }, { status: 502 });
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("")?.trim() ?? "";

  if (!text) {
    return NextResponse.json({ ok: false, error: "empty" as const }, { status: 502 });
  }

  return NextResponse.json(
    { ok: true, text },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
