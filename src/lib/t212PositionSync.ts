import { Prisma } from "@prisma/client";

import { normalizePortfolioCurrency, normalizeQuotePrice } from "@/lib/portfolioFx";
import { t212TickerToYahoo } from "@/lib/t212Ticker";
import type { T212Position } from "@/lib/trading212Client";

export type T212HoldingRow = Prisma.PortfolioHoldingCreateManyInput;

/** Map one T212 API position into a portfolio holding row (or null when skipped). */
export function mapT212PositionToHolding(
  p: T212Position,
  userId: string,
  accountCurrency: string | null,
): T212HoldingRow | null {
  const qty = Number(p.quantity ?? 0);
  if (!Number.isFinite(qty) || qty === 0) return null;

  const ticker = p.instrument?.ticker;
  if (!ticker) return null;

  const instrumentRaw = p.instrument?.currency;
  const walletCcy = normalizePortfolioCurrency(
    p.walletImpact?.currency ?? accountCurrency ?? instrumentRaw ?? "USD",
  );
  const walletMv = Number(p.walletImpact?.currentValue ?? 0);
  const walletCost = Number(p.walletImpact?.totalCost ?? 0);

  const avgInst = normalizeQuotePrice(Number(p.averagePricePaid ?? 0), instrumentRaw);
  const pxInst = normalizeQuotePrice(Number(p.currentPrice ?? 0), instrumentRaw);
  const instrumentCcy = avgInst.currency;

  let currency = walletCcy;
  let avgPrice = avgInst.price;
  let brokerPrice = pxInst.price > 0 ? pxInst.price : null;

  // T212 reports per-share prices in instrument currency but walletImpact in account currency.
  if (walletCcy !== instrumentCcy && qty > 0) {
    if (walletMv > 0) brokerPrice = walletMv / qty;
    if (walletCost > 0) avgPrice = walletCost / qty;
  }

  return {
    userId,
    symbolYahoo: t212TickerToYahoo(ticker),
    symbolT212: ticker,
    quantity: new Prisma.Decimal(qty),
    avgPrice: new Prisma.Decimal(Number.isFinite(avgPrice) ? avgPrice : 0),
    currency,
    brokerPrice:
      brokerPrice != null && Number.isFinite(brokerPrice) && brokerPrice > 0
        ? new Prisma.Decimal(brokerPrice)
        : null,
    source: "t212",
  };
}

/** Merge rows that share the same Yahoo symbol (multiple T212 lines → one holding). */
export function mergeT212HoldingRows(rows: T212HoldingRow[]): T212HoldingRow[] {
  const bySymbol = new Map<string, T212HoldingRow>();
  for (const r of rows) {
    const prev = bySymbol.get(r.symbolYahoo);
    if (!prev) {
      bySymbol.set(r.symbolYahoo, r);
      continue;
    }
    const prevQty = Number(prev.quantity);
    const qty = Number(r.quantity);
    const totalQty = prevQty + qty;
    const sameCurrency = prev.currency === r.currency;
    bySymbol.set(r.symbolYahoo, {
      ...prev,
      quantity: new Prisma.Decimal(totalQty),
      avgPrice:
        sameCurrency && totalQty > 0
          ? new Prisma.Decimal(
              (Number(prev.avgPrice) * prevQty + Number(r.avgPrice) * qty) / totalQty,
            )
          : prevQty >= qty
            ? prev.avgPrice
            : r.avgPrice,
      brokerPrice:
        qty >= prevQty && r.brokerPrice != null
          ? r.brokerPrice
          : prev.brokerPrice ?? r.brokerPrice ?? null,
      symbolT212: qty >= prevQty && r.symbolT212 ? r.symbolT212 : prev.symbolT212 ?? r.symbolT212,
    });
  }
  return [...bySymbol.values()];
}
