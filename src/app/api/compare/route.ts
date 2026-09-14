import { NextResponse } from "next/server";

import { checkRateLimit, clientKeyFromRequest, rateLimitResponse } from "@/lib/rateLimit";
import { MAX_COMPARE } from "@/lib/compareMetrics";
import { fetchCompareRows } from "@/lib/yahooCompare";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const key = clientKeyFromRequest(request);
  const limited = checkRateLimit("compare", key, 30, 60_000);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  const { searchParams } = new URL(request.url);
  const symbols = (searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z0-9.\-^]+$/.test(s))
    .slice(0, MAX_COMPARE);

  if (symbols.length === 0) return NextResponse.json({ rows: [] });
  const rows = await fetchCompareRows(symbols);
  return NextResponse.json({ rows });
}
