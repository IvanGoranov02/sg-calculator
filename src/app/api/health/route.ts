import { NextResponse } from "next/server";

import { FMP_ANNUAL_LIMIT, fetchStockBundleFromFmp, fmpApiKey, fmpRecentFailures } from "@/lib/fmp/client";
import { getGeminiApiKey } from "@/lib/geminiClient";
import { prisma } from "@/lib/prisma";
import { isValidStockSymbolInput } from "@/lib/stockSymbol";
import { checkRateLimit, clientKeyFromRequest, rateLimitResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** No secrets leave this endpoint — only presence booleans and probe statuses. */
async function probeFmp(): Promise<string> {
  const key = fmpApiKey();
  if (!key) return "not_configured";
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/income-statement?symbol=AAPL&period=annual&limit=${FMP_ANNUAL_LIMIT}&apikey=${key}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (res.status === 401) return "invalid_key (http 401)";
    if (res.status === 402 || res.status === 403) return `plan_limited (http ${res.status})`;
    if (!res.ok) return `error (http ${res.status})`;
    const data = (await res.json()) as unknown;
    return Array.isArray(data) && data.length > 0 ? "ok" : "ok_but_empty";
  } catch {
    return "network_error";
  }
}

export async function GET(request: Request) {
  const limited = checkRateLimit("health", clientKeyFromRequest(request), 10, 60_000);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  let db = "ok";
  try {
    await prisma.stockAnalysisCache.count();
  } catch {
    db = "error";
  }

  // Exercise the exact code path the loader uses, not just a single request.
  // ?symbol=XYZ probes a specific ticker (e.g. to check FMP plan coverage).
  const { searchParams } = new URL(request.url);
  const rawSym = (searchParams.get("symbol") ?? "AAPL").trim().toUpperCase();
  const probeSym = isValidStockSymbolInput(rawSym) ? rawSym : "AAPL";
  let fmpBundle = "not_configured";
  if (fmpApiKey()) {
    const b = await fetchStockBundleFromFmp(probeSym);
    fmpBundle = b
      ? `ok ${probeSym} (annual=${b.income.length}, quarters=${b.incomeQuarterly.length})`
      : `null (${probeSym})`;
  }

  return NextResponse.json({
    fmp: await probeFmp(),
    fmpBundle,
    fmpRecentFailures: fmpRecentFailures(),
    gemini: getGeminiApiKey() ? "configured" : "not_configured",
    edgarUserAgent: process.env.SEC_EDGAR_USER_AGENT?.trim() ? "configured" : "default",
    db,
  });
}
