import { requireAdminSession } from "@/lib/admin";
import { VERIFIED_CANDIDATES, isVerifiedCandidate } from "@/lib/verified/candidates";
import { buildVerified } from "@/lib/verified/service";
import { listVerified } from "@/lib/verified/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function gate(): Promise<Response | null> {
  const g = await requireAdminSession();
  if (g.ok) return null;
  return Response.json({ error: g.status === 401 ? "Unauthorized" : "Forbidden" }, { status: g.status });
}

/** Status of every candidate (rank order). */
export async function GET() {
  const denied = await gate();
  if (denied) return denied;
  try {
    const rows = new Map((await listVerified()).map((r) => [r.symbol, r]));
    return Response.json({
      items: VERIFIED_CANDIDATES.map((symbol, i) => {
        const r = rows.get(symbol);
        return {
          rank: i + 1,
          symbol,
          status: r ? r.status : "pending",
          latestQuarter: r?.latestQuarter ?? null,
          verifiedAt: r?.verifiedAt ?? null,
          checkedAt: r?.checkedAt ?? null,
          crossChecked: r?.crossChecked ?? 0,
          errors: r?.errors ?? [],
        };
      }),
    });
  } catch {
    return Response.json({ error: "Database unavailable." }, { status: 503 });
  }
}

/** (Re)build one company from SEC filings and verify it. */
export async function POST(request: Request) {
  const denied = await gate();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { symbol?: string } | null;
  const symbol = body?.symbol?.trim().toUpperCase() ?? "";
  if (!isVerifiedCandidate(symbol)) {
    return Response.json({ error: "Not a verified-data candidate." }, { status: 400 });
  }
  try {
    return Response.json(await buildVerified(symbol));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Build failed." }, { status: 500 });
  }
}
