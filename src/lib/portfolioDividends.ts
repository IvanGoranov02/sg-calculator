import type { PortfolioHolding } from "@prisma/client";

import { payloadToEditableBundle } from "@/lib/adminCacheApi";
import { computeTtmDpsGrowthPills, rollingSum4Quarterly } from "@/lib/dividendMetrics";
import { computeGrowthPills, type GrowthPills } from "@/lib/growthPills";
import { convertPortfolioMoney, normalizePortfolioCurrency, type PortfolioFxRates } from "@/lib/portfolioFx";
import type { PortfolioQuoteRow } from "@/lib/portfolioMarketData";
import { mapT212DividendItem, sortT212DividendsRecent } from "@/lib/t212Dividends";
import { t212TickerToYahooCandidates } from "@/lib/t212Ticker";
import type { T212HistoryDividendItem } from "@/lib/trading212Client";
import { sortQuarterlyByDateAsc } from "@/lib/stockAnalysisTypes";

export type PortfolioDividendPayment = {
  id: string;
  source: "t212" | "manual";
  ticker: string;
  symbolYahoo: string | null;
  amount: number;
  currency: string;
  paidOn: string;
  note?: string | null;
};

export type PortfolioDividendPosition = {
  symbol: string;
  name: string | null;
  quantity: number;
  avgPrice: number;
  currency: string;
  price: number | null;
  dividendYield: number | null;
  dividendPerShare: number | null;
  yieldOnCost: number | null;
  estAnnualIncome: number | null;
  growthPills: GrowthPills | null;
};

export type PortfolioDividendMonth = {
  month: string;
  totals: { currency: string; amount: number }[];
};

export type PortfolioDividendChartPoint = {
  month: string;
  income: number | null;
};

export type PortfolioDividendsPayload = {
  positions: PortfolioDividendPosition[];
  payments: PortfolioDividendPayment[];
  monthlyIncome: PortfolioDividendMonth[];
  chartSeries: PortfolioDividendChartPoint[];
  summary: {
    estAnnualByCurrency: { currency: string; amount: number }[];
    portfolioYieldOnValue: number | null;
    portfolioYieldOnCost: number | null;
    incomeGrowthPills: GrowthPills | null;
    baseCurrency: string;
  };
  trading212: { connected: boolean; error?: string; cachedAt?: string | null; partial?: boolean };
};

type HoldingRow = Pick<
  PortfolioHolding,
  "symbolYahoo" | "symbolT212" | "quantity" | "avgPrice" | "currency"
>;

type ManualDividendRow = {
  id: string;
  symbolYahoo: string | null;
  ticker: string;
  amount: { toString(): string };
  currency: string;
  paidOn: Date;
  note: string | null;
};

type HoldingDividendMetrics = {
  symbol: string;
  name: string | null;
  quantity: number;
  avgPrice: number;
  currency: string;
  price: number | null;
  cost: number;
  mv: number | null;
  dividendYield: number | null;
  dividendPerShare: number | null;
  yieldOnCost: number | null;
  estAnnualIncome: number | null;
  isPayer: boolean;
  resolvedSymbol: string;
};

function monthKey(isoDate: string): string | null {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7);
}

/** Inclusive yyyy-mm range with every calendar month. */
export function calendarMonthsBetween(minMonth: string, maxMonth: string): string[] {
  const [y0, m0] = minMonth.split("-").map(Number);
  const [y1, m1] = maxMonth.split("-").map(Number);
  if (!Number.isFinite(y0) || !Number.isFinite(m0) || !Number.isFinite(y1) || !Number.isFinite(m1)) {
    return [];
  }
  const out: string[] = [];
  let y = y0;
  let m = m0;
  while (y < y1 || (y === y1 && m <= m1)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function resolveYahooFromT212Ticker(ticker: string, holdings: HoldingRow[]): string | null {
  const t = ticker.trim();
  if (!t) return null;
  for (const h of holdings) {
    if (h.symbolT212 && h.symbolT212.trim().toUpperCase() === t.toUpperCase()) {
      return h.symbolYahoo;
    }
  }
  const candidates = t212TickerToYahooCandidates(t);
  for (const c of candidates) {
    if (holdings.some((h) => h.symbolYahoo.toUpperCase() === c.toUpperCase())) return c;
  }
  return candidates[0] ?? null;
}

export function growthPillsFromCachePayload(payload: unknown): GrowthPills | null {
  const bundle = payloadToEditableBundle(payload);
  if (!bundle?.dividendQuarterly?.length) return null;
  const sorted = sortQuarterlyByDateAsc(bundle.dividendQuarterly);
  const dpsArr = sorted.map((p) => p.dividendPerShare);
  const ttm = rollingSum4Quarterly(dpsArr);
  const pills = computeTtmDpsGrowthPills(ttm);
  const any =
    pills.oneYear != null ||
    pills.twoYear != null ||
    pills.threeYear != null ||
    pills.fourYear != null;
  return any ? pills : null;
}

export function buildMonthlyIncome(payments: PortfolioDividendPayment[]): PortfolioDividendMonth[] {
  const map = new Map<string, Map<string, number>>();
  for (const p of payments) {
    if (p.amount <= 0 || !Number.isFinite(p.amount)) continue;
    const key = monthKey(p.paidOn);
    if (!key) continue;
    const ccy = normalizePortfolioCurrency(p.currency);
    const bucket = map.get(key) ?? new Map<string, number>();
    bucket.set(ccy, (bucket.get(ccy) ?? 0) + p.amount);
    map.set(key, bucket);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, totalsMap]) => ({
      month,
      totals: [...totalsMap.entries()]
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => a.currency.localeCompare(b.currency)),
    }));
}

/** Zero-filled calendar month amounts for one currency (missing months = 0). */
export function buildFilledMonthlyAmounts(
  monthly: PortfolioDividendMonth[],
  currency: string,
): number[] {
  const ccy = normalizePortfolioCurrency(currency);
  const monthsWithCcy = monthly.filter((m) =>
    m.totals.some((t) => normalizePortfolioCurrency(t.currency) === ccy),
  );
  if (monthsWithCcy.length === 0) return [];

  const minMonth = monthsWithCcy[0]!.month;
  const maxMonth = monthsWithCcy[monthsWithCcy.length - 1]!.month;
  const calendar = calendarMonthsBetween(minMonth, maxMonth);
  const map = new Map<string, number>();
  for (const m of monthly) {
    const hit = m.totals.find((t) => normalizePortfolioCurrency(t.currency) === ccy);
    if (hit) map.set(m.month, hit.amount);
  }
  return calendar.map((month) => map.get(month) ?? 0);
}

/** Rolling 12-month paid income on a zero-filled calendar series. */
export function rollingTtmMonthly(amounts: number[]): (number | null)[] {
  return amounts.map((_, i) => {
    if (i < 11) return null;
    let sum = 0;
    for (let j = i - 11; j <= i; j++) sum += amounts[j] ?? 0;
    return sum;
  });
}

/** True TTM income growth from calendar months (zeros in quiet months). */
export function incomeGrowthPillsFromMonthly(
  monthly: PortfolioDividendMonth[],
  currency: string,
): GrowthPills | null {
  const filled = buildFilledMonthlyAmounts(monthly, currency);
  if (filled.length < 24) return null;
  const ttm = rollingTtmMonthly(filled);
  const pills = computeGrowthPills(ttm, 12);
  const any =
    pills.oneYear != null ||
    pills.twoYear != null ||
    pills.threeYear != null ||
    pills.fourYear != null;
  return any ? pills : null;
}

export function buildMonthlyChartSeries(
  monthly: PortfolioDividendMonth[],
  baseCurrency: string,
  fx: PortfolioFxRates,
): PortfolioDividendChartPoint[] {
  const base = normalizePortfolioCurrency(baseCurrency);
  return monthly.map((m) => {
    if (m.totals.length === 0) return { month: m.month, income: null };
    let total = 0;
    for (const t of m.totals) {
      const converted = convertPortfolioMoney(t.amount, t.currency, base, fx);
      if (converted == null) {
        return { month: m.month, income: null };
      }
      total += converted;
    }
    return { month: m.month, income: total };
  });
}

function pickBaseCurrency(holdings: HoldingRow[]): string {
  const counts = new Map<string, number>();
  for (const h of holdings) {
    counts.set(normalizePortfolioCurrency(h.currency), (counts.get(normalizePortfolioCurrency(h.currency)) ?? 0) + 1);
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

function computeHoldingMetrics(
  h: HoldingRow,
  quotes: Record<string, PortfolioQuoteRow | null>,
  fx: PortfolioFxRates,
): HoldingDividendMetrics {
  const q = quotes[h.symbolYahoo];
  const qQty = Number(h.quantity);
  const qAvg = Number(h.avgPrice);
  const holdingCcy = normalizePortfolioCurrency(h.currency);
  const quoteCcy = q ? normalizePortfolioCurrency(q.currency) : holdingCcy;
  const hasValidQuote = q != null && Number.isFinite(q.price) && q.price > 0;
  const priceInHolding =
    hasValidQuote && q ? convertPortfolioMoney(q.price, quoteCcy, holdingCcy, fx) : null;
  const cost = qAvg * qQty;
  const mv = priceInHolding != null && Number.isFinite(priceInHolding) ? priceInHolding * qQty : null;

  let dividendPerShare: number | null = null;
  let estAnnual: number | null = null;
  if (hasValidQuote && q) {
    if (q.dividendRate != null && Number.isFinite(q.dividendRate)) {
      const rateInHolding = convertPortfolioMoney(q.dividendRate, quoteCcy, holdingCcy, fx);
      if (rateInHolding != null) {
        dividendPerShare = rateInHolding;
        estAnnual = rateInHolding * qQty;
      }
    }
    if (estAnnual == null && q.dividendYield != null && Number.isFinite(q.dividendYield) && mv != null && mv > 0) {
      estAnnual = mv * q.dividendYield;
      if (qQty > 0) dividendPerShare = estAnnual / qQty;
    }
  }

  const yieldOnCost =
    estAnnual != null && cost > 0 && Number.isFinite(estAnnual) ? (estAnnual / cost) * 100 : null;

  const isPayer =
    (q?.dividendYield != null && q.dividendYield > 0) ||
    (q?.dividendRate != null && q.dividendRate > 0) ||
    (estAnnual != null && estAnnual > 0);

  return {
    symbol: h.symbolYahoo,
    name: q?.name ?? null,
    quantity: qQty,
    avgPrice: qAvg,
    currency: holdingCcy,
    price: priceInHolding,
    cost,
    mv,
    dividendYield: q?.dividendYield ?? null,
    dividendPerShare,
    yieldOnCost,
    estAnnualIncome: estAnnual,
    isPayer,
    resolvedSymbol: q?.resolvedYahooSymbol ?? h.symbolYahoo,
  };
}

export function buildPortfolioDividendsPayload(input: {
  holdings: HoldingRow[];
  quotes: Record<string, PortfolioQuoteRow | null>;
  fx: PortfolioFxRates;
  t212Items: T212HistoryDividendItem[];
  manualRows: ManualDividendRow[];
  cacheBySymbol: Record<string, unknown>;
  trading212: {
    connected: boolean;
    error?: string;
    cachedAt?: string | null;
    partial?: boolean;
  };
}): PortfolioDividendsPayload {
  const metrics = input.holdings.map((h) => computeHoldingMetrics(h, input.quotes, input.fx));
  const baseCurrency = pickBaseCurrency(input.holdings);
  const conv = (v: number | null, from: string) =>
    v == null ? null : convertPortfolioMoney(v, from, baseCurrency, input.fx);

  const positions: PortfolioDividendPosition[] = metrics
    .filter((m) => m.isPayer)
    .map((m) => ({
      symbol: m.symbol,
      name: m.name,
      quantity: m.quantity,
      avgPrice: m.avgPrice,
      currency: m.currency,
      price: m.price,
      dividendYield: m.dividendYield,
      dividendPerShare: m.dividendPerShare,
      yieldOnCost: m.yieldOnCost,
      estAnnualIncome: m.estAnnualIncome,
      growthPills:
        growthPillsFromCachePayload(input.cacheBySymbol[m.resolvedSymbol]) ??
        growthPillsFromCachePayload(input.cacheBySymbol[m.symbol]),
    }))
    .sort((a, b) => (b.estAnnualIncome ?? -1) - (a.estAnnualIncome ?? -1));

  let totalValue = 0;
  let totalCost = 0;
  let totalIncome = 0;
  for (const m of metrics) {
    const mvBase = conv(m.mv, m.currency);
    const costBase = conv(m.cost, m.currency);
    const incomeBase = conv(m.estAnnualIncome ?? 0, m.currency);
    if (mvBase != null) totalValue += mvBase;
    if (costBase != null) totalCost += costBase;
    if (incomeBase != null) totalIncome += incomeBase;
  }

  const t212Payments: PortfolioDividendPayment[] = sortT212DividendsRecent(input.t212Items).map((item, i) => {
    const row = mapT212DividendItem(item);
    const ticker = row.ticker === "—" ? `T212-${i}` : row.ticker;
    return {
      id: `t212:${ticker}:${row.paidOn ?? i}`,
      source: "t212" as const,
      ticker,
      symbolYahoo: resolveYahooFromT212Ticker(ticker, input.holdings),
      amount: row.amount ?? 0,
      currency: row.currency === "—" ? "USD" : row.currency,
      paidOn: row.paidOn ?? "",
    };
  });

  const manualPayments: PortfolioDividendPayment[] = input.manualRows.map((r) => ({
    id: r.id,
    source: "manual" as const,
    ticker: r.ticker,
    symbolYahoo: r.symbolYahoo,
    amount: Number(r.amount),
    currency: normalizePortfolioCurrency(r.currency),
    paidOn: r.paidOn.toISOString().slice(0, 10),
    note: r.note,
  }));

  const payments = [...t212Payments, ...manualPayments]
    .filter((p) => p.paidOn && p.amount > 0)
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn));

  const monthlyIncome = buildMonthlyIncome(payments);
  const chartSeries = buildMonthlyChartSeries(monthlyIncome, baseCurrency, input.fx);

  const estMap = new Map<string, number>();
  for (const p of positions) {
    if (p.estAnnualIncome == null || !Number.isFinite(p.estAnnualIncome)) continue;
    estMap.set(p.currency, (estMap.get(p.currency) ?? 0) + p.estAnnualIncome);
  }
  const estAnnualByCurrency = [...estMap.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  const portfolioYieldOnValue = totalValue > 0 ? (totalIncome / totalValue) * 100 : null;
  const portfolioYieldOnCost = totalCost > 0 ? (totalIncome / totalCost) * 100 : null;
  const incomeGrowthPills = incomeGrowthPillsFromMonthly(monthlyIncome, baseCurrency);

  return {
    positions,
    payments,
    monthlyIncome,
    chartSeries,
    summary: {
      estAnnualByCurrency,
      portfolioYieldOnValue,
      portfolioYieldOnCost,
      incomeGrowthPills,
      baseCurrency,
    },
    trading212: input.trading212,
  };
}
