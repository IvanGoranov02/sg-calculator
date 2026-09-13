import type { QuoteHistoryBar } from "@/lib/dipFinder";
import { calendarMonthsBetween } from "@/lib/portfolioDividends";
import { convertPortfolioMoney, normalizePortfolioCurrency, type PortfolioFxRates } from "@/lib/portfolioFx";

export type PortfolioValueMonthSource = "manual" | "t212" | "computed";

export type PortfolioValueChartPoint = {
  month: string;
  value: number | null;
  source: PortfolioValueMonthSource | null;
  changePct: number | null;
};

type HoldingRow = {
  symbolYahoo: string;
  quantity: number | { toString(): string };
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

export function monthKeyFromDate(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export function currentMonthKey(): string {
  return monthKeyFromDate(new Date());
}

export function isValidMonthKey(month: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(month)) return false;
  const [y, m] = month.split("-").map(Number);
  return Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12;
}

/** Last snapshot in each calendar month (T212 sync captures). */
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
    if (!b.date.startsWith(month)) continue;
    if (!Number.isFinite(b.close)) continue;
    if (!best || b.date.localeCompare(best.date) > 0) best = b;
  }
  return best ? best.close : null;
}

export function computeMonthlyValuesFromHoldings(
  holdings: HoldingRow[],
  historyBySymbol: Record<string, QuoteHistoryBar[]>,
  fx: PortfolioFxRates,
  baseCurrency: string,
  months: string[],
): Map<string, number | null> {
  const base = normalizePortfolioCurrency(baseCurrency);
  const out = new Map<string, number | null>();

  for (const month of months) {
    let total = 0;
    let any = false;
    let missingFx = false;

    for (const h of holdings) {
      const qty = Number(h.quantity);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const bars = historyBySymbol[h.symbolYahoo] ?? [];
      const close = monthEndCloseFromBars(bars, month);
      if (close == null) continue;
      const holdingCcy = normalizePortfolioCurrency(h.currency);
      const mv = convertPortfolioMoney(close * qty, holdingCcy, base, fx);
      if (mv == null) {
        missingFx = true;
        continue;
      }
      total += mv;
      any = true;
    }

    out.set(month, any && !missingFx ? total : any ? total : null);
  }

  return out;
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

function monthsFromQuoteHistory(
  holdings: HoldingRow[],
  historyBySymbol: Record<string, QuoteHistoryBar[]>,
): string[] {
  const months = new Set<string>();
  for (const h of holdings) {
    const bars = historyBySymbol[h.symbolYahoo] ?? [];
    for (const b of bars) {
      if (b.date.length >= 7) months.add(b.date.slice(0, 7));
    }
  }
  if (months.size === 0) return [];
  const sorted = [...months].sort();
  const last = sorted[sorted.length - 1]!;
  const end = last.localeCompare(currentMonthKey()) > 0 ? last : currentMonthKey();
  return calendarMonthsBetween(sorted[0]!, end);
}

function resolveMonthRange(input: {
  t212ByMonth: Map<string, number>;
  manualByMonth: Map<string, number>;
  computedByMonth: Map<string, number | null>;
}): string[] {
  const keys = new Set<string>([
    ...input.t212ByMonth.keys(),
    ...input.manualByMonth.keys(),
    ...[...input.computedByMonth.entries()].filter(([, v]) => v != null).map(([m]) => m),
  ]);
  if (keys.size === 0) return [];
  const sorted = [...keys].sort();
  const maxMonth = sorted[sorted.length - 1]!;
  const end = maxMonth.localeCompare(currentMonthKey()) > 0 ? maxMonth : currentMonthKey();
  return calendarMonthsBetween(sorted[0]!, end);
}

export function buildPortfolioValueChartSeries(input: {
  snapshots: SnapshotRow[];
  manualRows: ManualMonthRow[];
  holdings: HoldingRow[];
  historyBySymbol: Record<string, QuoteHistoryBar[]>;
  fx: PortfolioFxRates;
  baseCurrency?: string;
}): PortfolioValueChartPoint[] {
  const baseCurrency =
    input.baseCurrency ??
    (input.holdings.length > 0 ? pickBaseCurrencyFromHoldings(input.holdings) : "USD");
  const t212ByMonth = aggregateSnapshotsByMonth(input.snapshots, baseCurrency, input.fx);
  const manualByMonth = manualValuesByMonth(input.manualRows, baseCurrency, input.fx);

  const computedMonths = monthsFromQuoteHistory(input.holdings, input.historyBySymbol);
  const computedByMonth =
    input.holdings.length > 0 && computedMonths.length > 0
      ? computeMonthlyValuesFromHoldings(
          input.holdings,
          input.historyBySymbol,
          input.fx,
          baseCurrency,
          computedMonths,
        )
      : new Map<string, number | null>();

  const months = resolveMonthRange({ t212ByMonth, manualByMonth, computedByMonth });
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
