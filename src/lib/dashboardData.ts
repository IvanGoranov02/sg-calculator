import type { AnalyticsRow } from "@/lib/portfolioAnalytics";
import { estimateHoldingAnnualDividend } from "@/lib/portfolioDividends";
import { convertPortfolioMoney, normalizePortfolioCurrency, type PortfolioFxRates } from "@/lib/portfolioFx";
import type { PortfolioQuoteRow } from "@/lib/portfolioMarketData";

/** Pure helpers for the dashboard (client-safe). */

export type DashHolding = {
  symbolYahoo: string;
  symbolT212?: string | null;
  quantity: string;
  avgPrice: string;
  currency: string;
};

export type DashQuotes = Record<string, PortfolioQuoteRow | null>;

export function quoteFor(quotes: DashQuotes, symbol: string): PortfolioQuoteRow | null {
  return quotes[symbol] ?? quotes[symbol.trim().toUpperCase()] ?? null;
}

/** Same valuation rules as the Portfolio tab, reduced to what the dashboard needs. */
export function buildAnalyticsRows(
  holdings: DashHolding[],
  quotes: DashQuotes,
  fx: PortfolioFxRates,
): AnalyticsRow[] {
  return holdings
    .map((h) => {
      const q = quoteFor(quotes, h.symbolYahoo);
      const qty = Number(h.quantity);
      const avg = Number(h.avgPrice);
      const holdingCcy = normalizePortfolioCurrency(h.currency);
      const quoteCcy = q ? normalizePortfolioCurrency(q.currency) : holdingCcy;
      const hasPrice = q != null && Number.isFinite(q.price) && q.price > 0;
      const priceInHolding = hasPrice && q ? convertPortfolioMoney(q.price, quoteCcy, holdingCcy, fx) : null;
      const mv = priceInHolding != null && Number.isFinite(priceInHolding) ? priceInHolding * qty : null;
      const cost = avg * qty;
      const pl = mv != null ? mv - cost : null;
      const estAnnual = estimateHoldingAnnualDividend(h, q, fx)?.estAnnualIncome ?? null;
      return {
        symbol: h.symbolYahoo,
        name: q?.name ?? null,
        sector: q?.sector ?? null,
        holdingCcy,
        mv,
        cost,
        pl,
        estAnnual,
        dayChangePct: q && !q.fromBroker && Number.isFinite(q.changePercent) ? q.changePercent : null,
      } satisfies AnalyticsRow;
    })
    .sort((a, b) => (b.mv ?? -1) - (a.mv ?? -1));
}

/** Today's move of the whole portfolio in `base`, derived from each holding's session % change. */
export function computeDayChange(
  rows: AnalyticsRow[],
  fx: PortfolioFxRates,
  base: string,
): { amount: number; pct: number | null } {
  let amount = 0;
  let prevTotal = 0;
  for (const r of rows) {
    if (r.mv == null || r.dayChangePct == null) continue;
    const mvBase = convertPortfolioMoney(r.mv, r.holdingCcy, base, fx);
    if (mvBase == null) continue;
    const prev = mvBase / (1 + r.dayChangePct / 100);
    amount += mvBase - prev;
    prevTotal += prev;
  }
  return { amount, pct: prevTotal > 0 ? (amount / prevTotal) * 100 : null };
}

export type DashEvent = {
  kind: "earnings" | "exDividend" | "payDate";
  /** yyyy-mm-dd */
  date: string;
  symbol: string;
  name: string | null;
};

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Earnings, ex-dividend and pay dates of held companies in the next `days` days. */
export function upcomingEvents(
  holdings: DashHolding[],
  quotes: DashQuotes,
  days = 45,
  now = new Date(),
): DashEvent[] {
  const from = isoDay(now);
  const to = isoDay(new Date(now.getTime() + days * 86_400_000));
  const out: DashEvent[] = [];
  const seen = new Set<string>();
  for (const h of holdings) {
    const q = quoteFor(quotes, h.symbolYahoo);
    if (!q) continue;
    const add = (kind: DashEvent["kind"], date: string | null | undefined) => {
      const d = date?.slice(0, 10);
      if (!d || d < from || d > to) return;
      const key = `${kind}|${h.symbolYahoo}|${d}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ kind, date: d, symbol: h.symbolYahoo, name: q.name ?? null });
    };
    add("earnings", q.nextEarnings);
    add("exDividend", q.exDividendDate);
    add("payDate", q.dividendPayDate);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
}

export type Mover = { symbol: string; name: string | null; pct: number; price: number | null };

/** Biggest session movers across held and watched symbols (deduplicated). */
export function topMovers(
  held: { symbol: string; name: string | null; pct: number | null; price: number | null }[],
  limit = 4,
): { gainers: Mover[]; losers: Mover[] } {
  const seen = new Set<string>();
  const all: Mover[] = [];
  for (const m of held) {
    const key = m.symbol.toUpperCase();
    if (seen.has(key) || m.pct == null || !Number.isFinite(m.pct)) continue;
    seen.add(key);
    all.push({ symbol: m.symbol, name: m.name, pct: m.pct, price: m.price });
  }
  const gainers = all.filter((m) => m.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, limit);
  const losers = all.filter((m) => m.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, limit);
  return { gainers, losers };
}

/** Last `n` calendar months of dividend income in `base`, oldest first. */
export function lastMonthsIncome(
  chart: { month: string; income: number | null }[],
  n = 12,
): { month: string; income: number }[] {
  return chart.slice(-n).map((p) => ({ month: p.month, income: p.income ?? 0 }));
}
