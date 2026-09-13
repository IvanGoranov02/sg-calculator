import { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fetchPortfolioFxRates } from "@/lib/portfolioFxServer";
import { fetchPortfolioQuoteHistory } from "@/lib/portfolioQuoteHistoryServer";
import { normalizePortfolioCurrency } from "@/lib/portfolioFx";
import {
  buildPortfolioValueChartSeries,
  isValidMonthKey,
  pickBaseCurrencyFromHoldings,
} from "@/lib/portfolioValueHistory";
import { isPrismaInfrastructureError, prismaErrorToHttp } from "@/lib/prismaHttpError";

export const maxDuration = 60;

function parsePositiveDecimal(raw: unknown, label: string): Prisma.Decimal {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return new Prisma.Decimal(n);
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [holdings, snapshots, manualRows, fx] = await Promise.all([
      prisma.portfolioHolding.findMany({
        where: { userId },
        select: { symbolYahoo: true, quantity: true, currency: true },
      }),
      prisma.portfolioAccountSnapshot.findMany({
        where: { userId },
        orderBy: { capturedAt: "asc" },
      }),
      prisma.manualPortfolioMonthlyValue.findMany({
        where: { userId },
        orderBy: { month: "asc" },
      }),
      fetchPortfolioFxRates(),
    ]);

    const symbols = [...new Set(holdings.map((h) => h.symbolYahoo))];
    const historyBySymbol = symbols.length > 0 ? await fetchPortfolioQuoteHistory(symbols) : {};

    const baseCurrency =
      holdings.length > 0 ? pickBaseCurrencyFromHoldings(holdings) : "USD";

    const chartSeries = buildPortfolioValueChartSeries({
      snapshots: snapshots.map((s) => ({
        capturedAt: s.capturedAt,
        totalValue: Number(s.totalValue),
        currency: s.currency,
      })),
      manualRows: manualRows.map((r) => ({
        month: r.month,
        amount: Number(r.amount),
        currency: r.currency,
      })),
      holdings,
      historyBySymbol,
      fx,
      baseCurrency,
    });

    return Response.json({
      chartSeries,
      baseCurrency,
      manualEntries: manualRows.map((r) => ({
        month: r.month,
        amount: r.amount.toString(),
        currency: r.currency,
      })),
      computedHint: holdings.length > 0,
    });
  } catch (e) {
    if (isPrismaInfrastructureError(e)) {
      const { status, error } = prismaErrorToHttp(e);
      return Response.json({ error }, { status });
    }
    const { status, error } = prismaErrorToHttp(e);
    return Response.json({ error }, { status });
  }
}

export async function POST(request: Request) {
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

  const o = body as Record<string, unknown>;
  const month = typeof o.month === "string" ? o.month.trim() : "";
  if (!isValidMonthKey(month)) {
    return Response.json({ error: "month must be yyyy-mm" }, { status: 400 });
  }

  let amount: Prisma.Decimal;
  try {
    amount = parsePositiveDecimal(o.amount, "amount");
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Invalid input" }, { status: 400 });
  }

  const currency =
    typeof o.currency === "string" && o.currency.trim().length >= 3
      ? normalizePortfolioCurrency(o.currency)
      : "USD";

  try {
    const row = await prisma.manualPortfolioMonthlyValue.upsert({
      where: { userId_month: { userId, month } },
      create: { userId, month, amount, currency },
      update: { amount, currency },
    });

    return Response.json({
      month: row.month,
      amount: row.amount.toString(),
      currency: row.currency,
    });
  } catch (e) {
    const { status, error } = prismaErrorToHttp(e);
    return Response.json({ error }, { status });
  }
}
