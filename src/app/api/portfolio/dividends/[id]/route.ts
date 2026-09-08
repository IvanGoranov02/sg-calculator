import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { prismaErrorToHttp } from "@/lib/prismaHttpError";

type RouteCtx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, ctx: RouteCtx) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const row = await prisma.manualPortfolioDividend.findFirst({ where: { id, userId } });
  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await prisma.manualPortfolioDividend.delete({ where: { id, userId } });
    return Response.json({ ok: true });
  } catch (e) {
    const { status, error } = prismaErrorToHttp(e);
    return Response.json({ error }, { status });
  }
}
