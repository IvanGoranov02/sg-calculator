import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { prismaErrorToHttp } from "@/lib/prismaHttpError";
import { mutateSavedWatchlist, replaceSavedWatchlist, type WatchlistStore } from "@/lib/watchlistServer";

const watchlistStore: WatchlistStore = {
  transaction: (work) => prisma.$transaction(async (tx) => work({
    lockUser: async (userId) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
      `;
      return rows.length > 0;
    },
    readSymbols: async (userId) => {
      const rows = await tx.watchlistSymbol.findMany({
        where: { userId }, orderBy: { position: "asc" }, select: { symbol: true },
      });
      return rows.map((row) => row.symbol);
    },
    replaceSymbols: async (userId, symbols) => {
      await tx.watchlistSymbol.deleteMany({ where: { userId } });
      if (symbols.length > 0) {
        await tx.watchlistSymbol.createMany({
          data: symbols.map((symbol, position) => ({ userId, symbol, position })),
        });
      }
    },
  })),
};

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

  try {
    const result = await replaceSavedWatchlist(watchlistStore, userId, body);
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    const mapped = prismaErrorToHttp(error);
    return Response.json({ error: mapped.error }, { status: mapped.status });
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await mutateSavedWatchlist(watchlistStore, userId, body);
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    const mapped = prismaErrorToHttp(error);
    return Response.json({ error: mapped.error }, { status: mapped.status });
  }
}
