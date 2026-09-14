import { Prisma } from "@prisma/client";

import { normalizePortfolioCurrency, normalizeQuotePrice } from "@/lib/portfolioFx";
import { parseT212Ticker, t212TickerToYahoo, t212TickerToYahooCandidates } from "@/lib/t212Ticker";
import type { T212Position } from "@/lib/trading212Client";

export type T212HoldingRow = Prisma.PortfolioHoldingCreateManyInput;

/** T212 unique instrument id from new or legacy payload shapes. */
export function t212PositionTicker(p: T212Position): string | null {
  const raw =
    (typeof p.instrument?.ticker === "string" && p.instrument.ticker.trim()) ||
    (typeof p.ticker === "string" && p.ticker.trim()) ||
    (typeof p.instrumentCode === "string" && p.instrumentCode.trim()) ||
    "";
  return raw || null;
}

function t212PositionQuantity(p: T212Position): number {
  const qty = Number(p.quantity ?? 0);
  if (Number.isFinite(qty) && qty !== 0) return qty;
  const pies = Number(p.quantityInPies ?? p.pieQuantity ?? 0);
  return Number.isFinite(pies) ? pies : NaN;
}

/** Map one T212 API position into a portfolio holding row (or null when skipped). */
export function mapT212PositionToHolding(
  p: T212Position,
  userId: string,
  accountCurrency: string | null,
): T212HoldingRow | null {
  const qty = t212PositionQuantity(p);
  if (!Number.isFinite(qty) || qty === 0) return null;

  const ticker = t212PositionTicker(p);
  if (!ticker) return null;

  const instrumentRaw = p.instrument?.currency;
  const walletCcy = normalizePortfolioCurrency(
    p.walletImpact?.currency ?? accountCurrency ?? instrumentRaw ?? "USD",
  );
  const walletMv = Number(p.walletImpact?.currentValue ?? 0);
  const walletCost = Number(p.walletImpact?.totalCost ?? 0);

  const avgRaw = p.averagePricePaid ?? p.averagePrice;
  const pxRaw = p.currentPrice;
  const avgInst = normalizeQuotePrice(Number(avgRaw ?? 0), instrumentRaw);
  const pxInst = normalizeQuotePrice(Number(pxRaw ?? 0), instrumentRaw);
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

function mergeTwoRows(prev: T212HoldingRow, r: T212HoldingRow): T212HoldingRow {
  const prevQty = Number(prev.quantity);
  const qty = Number(r.quantity);
  const totalQty = prevQty + qty;
  const sameCurrency = prev.currency === r.currency;
  return {
    ...prev,
    quantity: new Prisma.Decimal(totalQty),
    avgPrice:
      sameCurrency && totalQty > 0
        ? new Prisma.Decimal((Number(prev.avgPrice) * prevQty + Number(r.avgPrice) * qty) / totalQty)
        : prevQty >= qty
          ? prev.avgPrice
          : r.avgPrice,
    brokerPrice:
      qty >= prevQty && r.brokerPrice != null ? r.brokerPrice : prev.brokerPrice ?? r.brokerPrice ?? null,
    symbolT212: qty >= prevQty && r.symbolT212 ? r.symbolT212 : prev.symbolT212 ?? r.symbolT212,
  };
}

function disambiguateYahooSymbol(row: T212HoldingRow, used: Set<string>): string {
  const current = row.symbolYahoo.trim().toUpperCase();
  if (!used.has(current)) return current;

  const ticker = typeof row.symbolT212 === "string" ? row.symbolT212 : "";
  const cands = ticker ? t212TickerToYahooCandidates(ticker, row.currency) : [];
  for (const c of cands) {
    if (!used.has(c)) return c;
  }

  const parsed = ticker ? parseT212Ticker(ticker) : null;
  if (parsed?.base && parsed.yahooSuffix) {
    const listing = `${parsed.base}${parsed.yahooSuffix}`;
    if (!used.has(listing)) return listing;
  }

  const fallback = ticker
    ? ticker.replace(/_EQ$/i, "").replace(/_/g, "-").toUpperCase()
    : `${current}-DUP`;
  if (!used.has(fallback)) return fallback;

  let n = 2;
  let next = `${current}-${n}`;
  while (used.has(next)) {
    n += 1;
    next = `${current}-${n}`;
  }
  return next;
}

/**
 * Merge only duplicate T212 instrument tickers (same listing).
 * Distinct T212 tickers stay separate even when Yahoo keys would otherwise collide
 * (Nasdaq vs Xetra of the same US company).
 */
export function mergeT212HoldingRows(rows: T212HoldingRow[]): T212HoldingRow[] {
  const byT212 = new Map<string, T212HoldingRow>();
  const withoutT212: T212HoldingRow[] = [];

  for (const r of rows) {
    const t212 = r.symbolT212?.trim();
    if (!t212) {
      withoutT212.push(r);
      continue;
    }
    const key = t212.toUpperCase();
    const prev = byT212.get(key);
    if (!prev) {
      byT212.set(key, r);
      continue;
    }
    byT212.set(key, mergeTwoRows(prev, r));
  }

  const usedYahoo = new Set<string>();
  const out: T212HoldingRow[] = [];
  for (const r of [...byT212.values(), ...withoutT212]) {
    const symbolYahoo = disambiguateYahooSymbol(r, usedYahoo);
    usedYahoo.add(symbolYahoo);
    out.push({ ...r, symbolYahoo });
  }
  return out;
}
