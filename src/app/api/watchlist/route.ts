import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { normalizeTicker, WATCHLIST_MAX } from "@/lib/watchlistStorage";

function parseBodySymbols(raw: unknown): string[] {
  if (raw === null || typeof raw !== "object") return [];
  const sym = (raw as { symbols?: unknown }).symbols;
  if (!Array.isArray(sym)) return [];
  const out: string[] = [];
  for (const item of sym) {
    if (typeof item !== "string") continue;
    const s = normalizeTicker(item);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= WATCHLIST_MAX) break;
  }
  return out;
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.watchlistSymbol.findMany({
    where: { userId },
    orderBy: { position: "asc" },
    select: { symbol: true },
  });

  return Response.json({ symbols: rows.map((r) => r.symbol) });
}

export async function PUT(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const symbols = parseBodySymbols(body);
  if (symbols.length > WATCHLIST_MAX) {
    return Response.json({ error: "Too many symbols" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.watchlistSymbol.deleteMany({ where: { userId } });
    if (symbols.length > 0) {
      await tx.watchlistSymbol.createMany({
        data: symbols.map((symbol, position) => ({ userId, symbol, position })),
      });
    }
  });

  return Response.json({ symbols });
}
