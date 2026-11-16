import { requireAdminSession } from "@/lib/admin";
import { isValidStockSymbolInput } from "@/lib/stockSymbol";
import { listCompanies } from "@/lib/verified/periodStore";
import { buildCompany, runQueue } from "@/lib/verified/service";
import { UNIVERSE } from "@/lib/verified/universe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function gate(): Promise<Response | null> {
  const g = await requireAdminSession();
  if (g.ok) return null;
  return Response.json({ error: g.status === 401 ? "Unauthorized" : "Forbidden" }, { status: g.status });
}

/** State of every company: the universe in rank order, then companies added by a page view. */
export async function GET() {
  const denied = await gate();
  if (denied) return denied;
  try {
    const rows = new Map((await listCompanies()).map((r) => [r.symbol, r]));
    const item = (symbol: string, name: string, country: string, world: number | null, us: number | null) => {
      const r = rows.get(symbol);
      rows.delete(symbol);
      return {
        symbol,
        name: r?.name ?? name,
        country,
        world,
        us,
        status: r ? r.status : "pending",
        profile: r?.profile ?? "general",
        full: r?.full ?? false,
        latestQuarter: r?.latestQuarter ?? null,
        periods: r?.periods ?? 0,
        verifiedPeriods: r?.verifiedPeriods ?? 0,
        nextCheckAt: r?.nextCheckAt ?? null,
        issues: r?.issues ?? [],
      };
    };
    const items = UNIVERSE.map((u) => item(u.s, u.n, u.c, u.w ?? null, u.u ?? null));
    for (const r of [...rows.values()]) items.push(item(r.symbol, r.name ?? r.symbol, "", null, null));
    return Response.json({ items });
  } catch {
    return Response.json({ error: "Database unavailable." }, { status: 503 });
  }
}

/** `{ symbol }` rebuilds one company from the sources; `{ action: "run" }` works the queue for one time budget. */
export async function POST(request: Request) {
  const denied = await gate();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { symbol?: string; action?: string } | null;
  try {
    if (body?.action === "run") return Response.json(await runQueue(40_000));
    const symbol = body?.symbol?.trim().toUpperCase() ?? "";
    if (!isValidStockSymbolInput(symbol)) return Response.json({ error: "Invalid symbol." }, { status: 400 });
    return Response.json(await buildCompany(symbol, { force: true }));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Build failed." }, { status: 500 });
  }
}
