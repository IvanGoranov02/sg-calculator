import type { QuoteHistoryBar } from "@/lib/dipFinder";
import { scaleHistoryBarsToQuotePrice } from "@/lib/dipFinder";
import { normalizeIsoDateString } from "@/lib/format";
import { calendarMonthsBetween } from "@/lib/portfolioDividends";
import { convertPortfolioMoney, inferCurrencyFromSymbol, normalizePortfolioCurrency, type PortfolioFxRates } from "@/lib/portfolioFx";
import { parseT212Ticker, t212QuoteCurrency } from "@/lib/t212Ticker";

export type PortfolioValueMonthSource = "manual" | "t212" | "computed";

export type PortfolioValueChartPoint = {
  month: string;
  value: number | null;
  source: PortfolioValueMonthSource | null;
  changePct: number | null;
};

export type HoldingRow = {
  symbolYahoo: string;
  symbolT212?: string | null;
  quantity: number | { toString(): string };
  currency: string;
};

export type QtyEvent = {
  symbolYahoo: string;
  date: string;
  delta: number;
};

export type LiveQuote = {
  price: number;
  currency: string;
};

type SnapshotRow = {
  capturedAt: Date;
  totalValue: number;
  currency: string;
};

type ManualMonthRow = {
  month: string;
  amount: number;
  currency: string;
};

const BASE_CURRENCIES = new Set(["EUR", "USD", "GBP"]);

/** Calendar yyyy-mm from a timestamp using UTC date parts (snapshots / capturedAt). */
export function monthKeyFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Calendar yyyy-mm from an ISO date or datetime (fill dates, bar dates). */
export function monthKeyFromIsoDate(raw: string): string | null {
  const iso = normalizeIsoDateString(raw);
  return iso ? iso.slice(0, 7) : null;
}

export function monthKeyFromParts(year: number, month: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  if (year < 1990 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthKey(month: string): { year: number; month: number } | null {
  if (!isValidMonthKey(month)) return null;
  const [y, m] = month.split("-").map(Number);
  return { year: y, month: m };
}

export function currentMonthKey(now = new Date()): string {
  return monthKeyFromDate(now);
}

export function isValidMonthKey(month: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(month)) return false;
  const [y, m] = month.split("-").map(Number);
  return Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12;
}

/** Inclusive calendar months from the first fill through the current UTC month. */
export function calendarMonthsForEvents(events: QtyEvent[], now = new Date()): string[] {
  const months = events
    .map((e) => monthKeyFromIsoDate(e.date))
    .filter((m): m is string => !!m);
  if (months.length === 0) return [];
  months.sort();
  const end = currentMonthKey(now);
  const last = months[months.length - 1]!;
  return calendarMonthsBetween(months[0]!, last.localeCompare(end) > 0 ? last : end);
}

export function lastIsoDateOfMonth(month: string): string | null {
  const parsed = parseMonthKey(month);
  if (!parsed) return null;
  const d = new Date(Date.UTC(parsed.year, parsed.month, 0));
  return d.toISOString().slice(0, 10);
}

export function parseChartBaseCurrency(raw: string | null | undefined, fallback = "USD"): string {
  const c = normalizePortfolioCurrency(raw);
  return BASE_CURRENCIES.has(c) ? c : normalizePortfolioCurrency(fallback);
}

/** Listing currency for Yahoo/T212 prices — not T212 wallet/account currency. */
export function listingPriceCurrency(symbolYahoo: string, symbolT212?: string | null): string {
  if (symbolT212) return t212QuoteCurrency(symbolT212, inferCurrencyFromSymbol(symbolYahoo));
  return inferCurrencyFromSymbol(symbolYahoo);
}

export function isYahooPenceHistory(symbolYahoo: string, symbolT212?: string | null): boolean {
  if (/\.L$/i.test(symbolYahoo.trim())) return true;
  if (symbolT212) return parseT212Ticker(symbolT212).yahooSuffix === ".L";
  return false;
}

/** Scale Yahoo daily closes into listing-currency units (GBp → GBP). */
export function prepareHistoryBarsForValue(
  bars: QuoteHistoryBar[],
  symbolYahoo: string,
  symbolT212?: string | null,
  livePrice?: number | null,
): QuoteHistoryBar[] {
  if (livePrice != null && Number.isFinite(livePrice) && livePrice > 0) {
    return scaleHistoryBarsToQuotePrice(bars, livePrice);
  }
  if (isYahooPenceHistory(symbolYahoo, symbolT212)) {
    return bars.map((b) => ({ ...b, close: b.close / 100 }));
  }
  return bars;
}

/** Last snapshot in each UTC calendar month (T212 sync captures). */
export function aggregateSnapshotsByMonth(
  snapshots: SnapshotRow[],
  baseCurrency: string,
  fx: PortfolioFxRates,
): Map<string, number> {
  const base = normalizePortfolioCurrency(baseCurrency);
  const byMonth = new Map<string, { capturedAt: Date; value: number }>();

  for (const s of snapshots) {
    if (!Number.isFinite(s.totalValue) || s.totalValue < 0) continue;
    const month = monthKeyFromDate(s.capturedAt);
    const converted = convertPortfolioMoney(s.totalValue, s.currency, base, fx);
    if (converted == null) continue;
    const prev = byMonth.get(month);
    if (!prev || s.capturedAt.getTime() >= prev.capturedAt.getTime()) {
      byMonth.set(month, { capturedAt: s.capturedAt, value: converted });
    }
  }

  return new Map([...byMonth.entries()].map(([month, { value }]) => [month, value]));
}

/** Last daily close within a yyyy-mm month. */
export function monthEndCloseFromBars(bars: QuoteHistoryBar[], month: string): number | null {
  let best: QuoteHistoryBar | null = null;
  for (const b of bars) {
    const barMonth = b.date.length >= 7 ? b.date.slice(0, 7) : monthKeyFromIsoDate(b.date);
    if (barMonth !== month) continue;
    if (!Number.isFinite(b.close)) continue;
    if (!best || b.date.localeCompare(best.date) > 0) best = b;
  }
  return best ? best.close : null;
}

export function holdingQuantity(h: HoldingRow): number {
  const qty = Number(h.quantity);
  return Number.isFinite(qty) ? qty : NaN;
}

/**
 * Running share count at each month-end from signed fill events (buys +, sells −, splits +).
 * Month → symbolYahoo → quantity.
 */
export function quantitiesByMonthFromEvents(events: QtyEvent[], months: string[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  if (months.length === 0) return out;

  const sorted = [...events]
    .filter((e) => Number.isFinite(e.delta) && e.delta !== 0 && normalizeIsoDateString(e.date))
    .sort((a, b) => {
      const da = normalizeIsoDateString(a.date) ?? "";
      const db = normalizeIsoDateString(b.date) ?? "";
      return da.localeCompare(db);
    });

  const running = new Map<string, number>();
  let i = 0;
  for (const month of months) {
    const cutoff = lastIsoDateOfMonth(month);
    if (!cutoff) continue;
    while (i < sorted.length) {
      const ev = sorted[i]!;
      const d = normalizeIsoDateString(ev.date)!;
      if (d > cutoff) break;
      const sym = ev.symbolYahoo.trim().toUpperCase();
      running.set(sym, (running.get(sym) ?? 0) + ev.delta);
      i += 1;
    }
    const snap = new Map<string, number>();
    for (const [sym, qty] of running) {
      if (qty > 1e-8) snap.set(sym, qty);
    }
    out.set(month, snap);
  }
  return out;
}

/** True when reconstructed current-month qty matches live holdings (incomplete order history fails). */
export function quantityTimelineMatchesHoldings(
  qtyByMonth: Map<string, Map<string, number>>,
  currentMonth: string,
  holdings: HoldingRow[],
  tolerance = 0.2,
): boolean {
  const atMonth = qtyByMonth.get(currentMonth);
  if (!atMonth || atMonth.size === 0) return false;

  const live = new Map<string, number>();
  for (const h of holdings) {
    const qty = holdingQuantity(h);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const k = h.symbolYahoo.trim().toUpperCase();
    live.set(k, (live.get(k) ?? 0) + qty);
  }
  if (live.size === 0) return false;

  for (const [sym, liveQty] of live) {
    const reconstructed = atMonth.get(sym) ?? 0;
    const denom = Math.max(liveQty, reconstructed, 1e-9);
    if (Math.abs(reconstructed - liveQty) / denom > tolerance) return false;
  }
  return true;
}

export function computeMonthlyValuesFromHoldings(
  holdings: HoldingRow[],
  historyBySymbol: Record<string, QuoteHistoryBar[]>,
  fx: PortfolioFxRates,
  baseCurrency: string,
  months: string[],
  qtyByMonth?: Map<string, Map<string, number>>,
): Map<string, number | null> {
  const base = normalizePortfolioCurrency(baseCurrency);
  const out = new Map<string, number | null>();
  const holdingBySymbol = new Map<string, HoldingRow>();
  for (const h of holdings) {
    holdingBySymbol.set(h.symbolYahoo.trim().toUpperCase(), h);
  }

  for (const month of months) {
    const qtyMap = qtyByMonth?.get(month);
    const symbols = qtyMap
      ? [...qtyMap.keys()]
      : holdings.map((h) => h.symbolYahoo.trim().toUpperCase()).filter(Boolean);

    let total = 0;
    let any = false;

    for (const sym of symbols) {
      const qty = qtyMap ? (qtyMap.get(sym) ?? 0) : holdingQuantity(holdingBySymbol.get(sym) ?? { symbolYahoo: sym, quantity: 0, currency: "USD" });
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const h = holdingBySymbol.get(sym);
      const bars = historyBySymbol[sym] ?? historyBySymbol[h?.symbolYahoo ?? ""] ?? [];
      const close = monthEndCloseFromBars(bars, month);
      if (close == null) continue;
      const pxCcy = listingPriceCurrency(h?.symbolYahoo ?? sym, h?.symbolT212);
      const mv = convertPortfolioMoney(close * qty, pxCcy, base, fx);
      if (mv == null) continue;
      total += mv;
      any = true;
    }

    out.set(month, any ? total : null);
  }

  return out;
}

/** Current holdings × live quotes in listing/quote currency, converted to base (matches Holdings tab). */
export function computeLiveHoldingsValue(
  holdings: HoldingRow[],
  quotes: Record<string, LiveQuote | null | undefined>,
  fx: PortfolioFxRates,
  baseCurrency: string,
): number | null {
  const base = normalizePortfolioCurrency(baseCurrency);
  let total = 0;
  let any = false;
  for (const h of holdings) {
    const qty = holdingQuantity(h);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const q = quotes[h.symbolYahoo] ?? quotes[h.symbolYahoo.trim().toUpperCase()];
    if (!q || !Number.isFinite(q.price) || q.price <= 0) continue;
    const mv = convertPortfolioMoney(q.price * qty, q.currency, base, fx);
    if (mv == null) continue;
    total += mv;
    any = true;
  }
  return any ? total : null;
}

export function pickBaseCurrencyFromHoldings(holdings: HoldingRow[]): string {
  const counts = new Map<string, number>();
  for (const h of holdings) {
    const c = normalizePortfolioCurrency(h.currency);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best = "USD";
  let bestN = -1;
  for (const [c, n] of counts) {
    if (n > bestN || (n === bestN && (c === "EUR" || (c === "USD" && best !== "EUR")))) {
      best = c;
      bestN = n;
    }
  }
  return best;
}

function manualValuesByMonth(
  rows: ManualMonthRow[],
  baseCurrency: string,
  fx: PortfolioFxRates,
): Map<string, number> {
  const base = normalizePortfolioCurrency(baseCurrency);
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!isValidMonthKey(r.month)) continue;
    const converted = convertPortfolioMoney(r.amount, r.currency, base, fx);
    if (converted == null) continue;
    out.set(r.month, converted);
  }
  return out;
}

function resolveMonthRange(keys: string[], now = new Date()): string[] {
  if (keys.length === 0) return [];
  const sorted = [...new Set(keys.filter(isValidMonthKey))].sort();
  if (sorted.length === 0) return [];
  const maxMonth = sorted[sorted.length - 1]!;
  const cur = currentMonthKey(now);
  const end = maxMonth.localeCompare(cur) > 0 ? maxMonth : cur;
  return calendarMonthsBetween(sorted[0]!, end);
}

export function buildPortfolioValueChartSeries(input: {
  snapshots: SnapshotRow[];
  manualRows: ManualMonthRow[];
  holdings: HoldingRow[];
  historyBySymbol: Record<string, QuoteHistoryBar[]>;
  fx: PortfolioFxRates;
  baseCurrency?: string;
  qtyByMonth?: Map<string, Map<string, number>>;
  liveValue?: number | null;
  now?: Date;
}): PortfolioValueChartPoint[] {
  const now = input.now ?? new Date();
  const thisMonth = currentMonthKey(now);
  const baseCurrency =
    input.baseCurrency ??
    (input.holdings.length > 0 ? pickBaseCurrencyFromHoldings(input.holdings) : "USD");
  const t212ByMonth = aggregateSnapshotsByMonth(input.snapshots, baseCurrency, input.fx);
  const manualByMonth = manualValuesByMonth(input.manualRows, baseCurrency, input.fx);

  const useQtyTimeline = input.qtyByMonth != null && input.qtyByMonth.size > 0;
  const historicalMonths = useQtyTimeline
    ? [...input.qtyByMonth!.keys()].sort()
    : [];
  const computedMonths = useQtyTimeline ? historicalMonths : [];
  const computedByMonth =
    computedMonths.length > 0
      ? computeMonthlyValuesFromHoldings(
          input.holdings,
          input.historyBySymbol,
          input.fx,
          baseCurrency,
          computedMonths,
          input.qtyByMonth,
        )
      : new Map<string, number | null>();

  if (input.liveValue != null && Number.isFinite(input.liveValue) && input.liveValue >= 0) {
    computedByMonth.set(thisMonth, input.liveValue);
  } else if (!computedByMonth.has(thisMonth) && input.holdings.length > 0) {
    const currentOnly = computeMonthlyValuesFromHoldings(
      input.holdings,
      input.historyBySymbol,
      input.fx,
      baseCurrency,
      [thisMonth],
    );
    const v = currentOnly.get(thisMonth);
    if (v != null) computedByMonth.set(thisMonth, v);
  }

  const months = resolveMonthRange(
    [
      ...t212ByMonth.keys(),
      ...manualByMonth.keys(),
      ...[...computedByMonth.entries()].filter(([, v]) => v != null).map(([m]) => m),
    ],
    now,
  );
  if (months.length === 0) return [];

  const points: PortfolioValueChartPoint[] = [];
  let prevValue: number | null = null;

  for (const month of months) {
    let value: number | null = null;
    let source: PortfolioValueMonthSource | null = null;

    if (manualByMonth.has(month)) {
      value = manualByMonth.get(month)!;
      source = "manual";
    } else if (t212ByMonth.has(month)) {
      value = t212ByMonth.get(month)!;
      source = "t212";
    } else {
      const computed = computedByMonth.get(month);
      if (computed != null) {
        value = computed;
        source = "computed";
      }
    }

    if (value == null) continue;

    const changePct =
      prevValue != null && prevValue > 0 ? ((value - prevValue) / prevValue) * 100 : null;
    points.push({ month, value, source, changePct });
    prevValue = value;
  }

  return points;
}
