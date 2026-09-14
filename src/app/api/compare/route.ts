import { NextResponse } from "next/server";

import { parseCompareSymbols } from "@/lib/compareMetrics";
import { checkRateLimit, clientKeyFromRequest, rateLimitResponse } from "@/lib/rateLimit";
import { fetchCompareRows } from "@/lib/yahooCompare";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const key = clientKeyFromRequest(request);
  const limited = checkRateLimit("compare", key, 30, 60_000);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  const { searchParams } = new URL(request.url);
  const symbols = parseCompareSymbols(searchParams.get("symbols"));

  if (symbols.length === 0) return NextResponse.json({ rows: [] });
  const rows = await fetchCompareRows(symbols);
  return NextResponse.json({ rows });
}
