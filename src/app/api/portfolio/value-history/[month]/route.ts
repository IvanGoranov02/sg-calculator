import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isValidMonthKey } from "@/lib/portfolioValueHistory";
import { prismaErrorToHttp } from "@/lib/prismaHttpError";

type RouteCtx = { params: Promise<{ month: string }> };

export async function DELETE(_request: Request, ctx: RouteCtx) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { month } = await ctx.params;
  if (!isValidMonthKey(month)) {
    return Response.json({ error: "Invalid month" }, { status: 400 });
  }

  const row = await prisma.manualPortfolioMonthlyValue.findFirst({ where: { userId, month } });
  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await prisma.manualPortfolioMonthlyValue.delete({ where: { id: row.id, userId } });
    return Response.json({ ok: true });
  } catch (e) {
    const { status, error } = prismaErrorToHttp(e);
    return Response.json({ error }, { status });
  }
}
