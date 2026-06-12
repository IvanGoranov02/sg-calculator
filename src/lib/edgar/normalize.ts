/**
 * SEC EDGAR XBRL companyfacts → StockAnalysisBundle fundamentals.
 *
 * As-reported data straight from filings: authoritative for SEC filers (all US
 * listings + foreign issuers with ADRs). Quarterly flows are reconstructed from
 * the filed durations: direct ~3-month facts where present, otherwise by
 * differencing the YTD chain within each fiscal year (cash-flow statements in
 * 10-Qs are cumulative), so Q4 = FY − 9-month YTD.
 */

import type {
  BalanceSheetAnnual,
  BalanceSheetQuarter,
  CashFlowAnnual,
  CashFlowQuarter,
  IncomeStatementAnnual,
  IncomeStatementQuarter,
  InvestorMetrics,
  StockAnalysisBundle,
} from "@/lib/stockAnalysisTypes";

export type EdgarFactPoint = {
  start?: string;
  end: string;
  val: number;
  form?: string;
  filed?: string;
};

export type EdgarCompanyFacts = {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, { units: Record<string, EdgarFactPoint[]> }>>;
};

const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"]);

/** us-gaap first, then IFRS tags used by 20-F filers. */
const CONCEPTS: Record<string, string[]> = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
    "RevenuesNetOfInterestExpense",
    "Revenue",
    "RevenueFromContractsWithCustomers",
  ],
  costOfRevenue: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold", "CostOfSales"],
  grossProfit: ["GrossProfit"],
  operatingExpenses: ["OperatingExpenses"],
  operatingIncome: ["OperatingIncomeLoss", "ProfitLossFromOperatingActivities"],
  netIncome: ["NetIncomeLoss", "ProfitLoss", "ProfitLossAttributableToOwnersOfParent"],
  depreciationAmortization: [
    "DepreciationDepletionAndAmortization",
    "DepreciationAmortizationAndAccretionNet",
    "DepreciationAndAmortisationExpense",
  ],
  dilutedEps: ["EarningsPerShareDiluted", "DilutedEarningsLossPerShare"],
  dilutedShares: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
  operatingCashFlow: [
    "NetCashProvidedByUsedInOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
    "CashFlowsFromUsedInOperatingActivities",
  ],
  capitalExpenditure: [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquireProductiveAssets",
    "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
  ],
  investingCashFlow: [
    "NetCashProvidedByUsedInInvestingActivities",
    "CashFlowsFromUsedInInvestingActivities",
  ],
  financingCashFlow: [
    "NetCashProvidedByUsedInFinancingActivities",
    "CashFlowsFromUsedInFinancingActivities",
  ],
  dividendsPaid: [
    "PaymentsOfDividends",
    "PaymentsOfDividendsCommonStock",
    "DividendsPaidClassifiedAsFinancingActivities",
  ],
  stockRepurchase: ["PaymentsForRepurchaseOfCommonStock"],
  totalAssets: ["Assets"],
  stockholdersEquity: [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    "EquityAttributableToOwnersOfParent",
    "Equity",
  ],
  cash: [
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
    "CashAndCashEquivalents",
  ],
  currentAssets: ["AssetsCurrent", "CurrentAssets"],
  currentLiabilities: ["LiabilitiesCurrent", "CurrentLiabilities"],
  inventory: ["InventoryNet", "Inventories"],
  accountsReceivable: ["AccountsReceivableNetCurrent", "TradeAndOtherCurrentReceivables"],
  goodwill: ["Goodwill"],
  longTermDebt: ["LongTermDebtNoncurrent", "LongTermDebt"],
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(startIso: string, endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / DAY_MS);
}

function preferredUnit(units: Record<string, EdgarFactPoint[]>): string | null {
  const keys = Object.keys(units);
  if (keys.length === 0) return null;
  for (const want of ["USD", "USD/shares", "shares"]) {
    if (keys.includes(want)) return want;
  }
  return keys.reduce((a, b) => ((units[a]?.length ?? 0) >= (units[b]?.length ?? 0) ? a : b));
}

/** First concept from the priority list that has facts, searching all taxonomies. */
function conceptPoints(facts: EdgarCompanyFacts, concepts: string[]): EdgarFactPoint[] {
  for (const concept of concepts) {
    for (const ns of Object.keys(facts.facts)) {
      if (ns === "dei") continue;
      const entry = facts.facts[ns]?.[concept];
      if (!entry?.units) continue;
      const unit = preferredUnit(entry.units);
      const pts = unit ? entry.units[unit] : null;
      if (pts && pts.length > 0) {
        return pts.filter((p) => p?.end && typeof p.val === "number" && Number.isFinite(p.val));
      }
    }
  }
  return [];
}

/** Filing currency from the revenue concept's unit (20-F filers often report in EUR etc.). */
export function detectReportingCurrency(facts: EdgarCompanyFacts): string {
  for (const concept of CONCEPTS.revenue) {
    for (const ns of Object.keys(facts.facts)) {
      if (ns === "dei") continue;
      const units = facts.facts[ns]?.[concept]?.units;
      if (!units) continue;
      const unit = preferredUnit(units);
      if (unit && /^[A-Z]{3}$/.test(unit)) return unit;
    }
  }
  return "USD";
}

/** One value per (start,end) period; comparatives repeat in later filings — latest filed wins. */
function dedupeByPeriod(points: EdgarFactPoint[]): EdgarFactPoint[] {
  const byPeriod = new Map<string, EdgarFactPoint>();
  for (const p of points) {
    const key = `${p.start ?? ""}|${p.end}`;
    const prev = byPeriod.get(key);
    if (!prev || (p.filed ?? "") >= (prev.filed ?? "")) byPeriod.set(key, p);
  }
  return [...byPeriod.values()];
}

export type FlowSeries = {
  /** Fiscal-year value keyed by period end date (ISO). */
  annual: Map<string, number>;
  /** ~3-month value keyed by quarter end date (ISO). */
  quarterly: Map<string, number>;
};

export function buildFlowSeries(rawPoints: EdgarFactPoint[]): FlowSeries {
  const points = dedupeByPeriod(rawPoints.filter((p) => p.start));
  const annual = new Map<string, number>();
  const quarterly = new Map<string, number>();

  for (const p of points) {
    const days = daysBetween(p.start as string, p.end);
    if (days >= 330 && days <= 390 && (ANNUAL_FORMS.has(p.form ?? "") || days >= 350)) {
      annual.set(p.end, p.val);
    } else if (days >= 75 && days <= 105) {
      quarterly.set(p.end, p.val);
    }
  }

  // Difference the YTD chain (3mo → 6mo → 9mo → FY from the same fiscal-year start)
  // to recover quarters that are only filed cumulatively (cash flow, and every Q4).
  for (const [fyEnd, fyVal] of annual) {
    const fyPoint = points.find(
      (p) => p.end === fyEnd && daysBetween(p.start as string, p.end) >= 330,
    );
    if (!fyPoint?.start) continue;
    const chain = points
      .filter(
        (p) =>
          Math.abs(daysBetween(fyPoint.start as string, p.start as string)) <= 7 &&
          p.end <= fyEnd &&
          daysBetween(p.start as string, p.end) >= 75,
      )
      .sort((a, b) => a.end.localeCompare(b.end));
    if (chain.length === 0) continue;
    if (chain[chain.length - 1].end !== fyEnd) {
      chain.push({ ...fyPoint, val: fyVal });
    }
    for (let i = 1; i < chain.length; i++) {
      const gapDays = daysBetween(chain[i - 1].end, chain[i].end);
      if (gapDays < 75 || gapDays > 105) continue;
      if (!quarterly.has(chain[i].end)) {
        // Round away float noise from differencing (matters for per-share values).
        quarterly.set(chain[i].end, Math.round((chain[i].val - chain[i - 1].val) * 1e6) / 1e6);
      }
    }
  }

  return { annual, quarterly };
}

export type InstantSeries = {
  annual: Map<string, number>;
  quarterly: Map<string, number>;
};

export function buildInstantSeries(rawPoints: EdgarFactPoint[]): InstantSeries {
  const instantPoints = rawPoints.filter((p) => !p.start);
  // Fiscal-year ends: comparatives re-file in later 10-Qs and win the dedupe,
  // so mark a date as annual when ANY filing reported it in an annual form.
  const annualEnds = new Set(
    instantPoints.filter((p) => ANNUAL_FORMS.has(p.form ?? "")).map((p) => p.end),
  );
  const points = dedupeByPeriod(instantPoints);
  const annual = new Map<string, number>();
  const quarterly = new Map<string, number>();
  for (const p of points) {
    quarterly.set(p.end, p.val);
    if (annualEnds.has(p.end)) annual.set(p.end, p.val);
  }
  return { annual, quarterly };
}

export function emptyInvestorMetrics(currency: string): InvestorMetrics {
  return {
    currency,
    marketCap: null,
    enterpriseValue: null,
    trailingPE: null,
    forwardPE: null,
    pegRatio: null,
    priceToSales: null,
    priceToBook: null,
    enterpriseToRevenue: null,
    enterpriseToEbitda: null,
    beta: null,
    fiftyTwoWeekLow: null,
    fiftyTwoWeekHigh: null,
    fiftyDayAverage: null,
    twoHundredDayAverage: null,
    regularMarketVolume: null,
    averageDailyVolume3Month: null,
    grossMargins: null,
    operatingMargins: null,
    profitMargins: null,
    returnOnEquity: null,
    returnOnAssets: null,
    revenueGrowth: null,
    earningsGrowth: null,
    debtToEquity: null,
    currentRatio: null,
    quickRatio: null,
    totalCash: null,
    totalDebt: null,
    dividendRate: null,
    dividendYield: null,
    payoutRatio: null,
    trailingEps: null,
    forwardEps: null,
    bookValue: null,
    revenuePerShare: null,
    sharesOutstanding: null,
    floatShares: null,
    heldPercentInsiders: null,
    heldPercentInstitutions: null,
    shortPercentOfFloat: null,
    targetMeanPrice: null,
    targetMedianPrice: null,
    recommendationKey: null,
    numberOfAnalystOpinions: null,
  };
}

type Series = Record<string, FlowSeries>;

function at(series: Series, key: string, map: "annual" | "quarterly", end: string): number | null {
  return series[key]?.[map].get(end) ?? null;
}

/** Negative cash-outflow convention (matches Yahoo): payments are stored as negative. */
function outflowAt(series: Series, key: string, map: "annual" | "quarterly", end: string): number | null {
  const v = at(series, key, map, end);
  return v == null ? null : -Math.abs(v);
}

function sortedDatesDesc(...maps: Map<string, number>[]): string[] {
  const all = new Set<string>();
  for (const m of maps) for (const k of m.keys()) all.add(k);
  return [...all].sort((a, b) => b.localeCompare(a));
}

/**
 * Build the fundamentals part of a bundle. Returns null when the filing data is
 * too thin to be useful (caller then falls back to the Gemini pipeline).
 */
export function bundleFromCompanyFacts(
  symbol: string,
  facts: EdgarCompanyFacts,
): StockAnalysisBundle | null {
  const sym = symbol.trim().toUpperCase();

  const flow: Series = {};
  for (const key of [
    "revenue",
    "costOfRevenue",
    "grossProfit",
    "operatingExpenses",
    "operatingIncome",
    "netIncome",
    "depreciationAmortization",
    "dilutedEps",
    "dilutedShares",
    "operatingCashFlow",
    "capitalExpenditure",
    "investingCashFlow",
    "financingCashFlow",
    "dividendsPaid",
    "stockRepurchase",
  ]) {
    flow[key] = buildFlowSeries(conceptPoints(facts, CONCEPTS[key]));
  }

  const instant: Record<string, InstantSeries> = {};
  for (const key of [
    "totalAssets",
    "stockholdersEquity",
    "cash",
    "currentAssets",
    "currentLiabilities",
    "inventory",
    "accountsReceivable",
    "goodwill",
    "longTermDebt",
  ]) {
    instant[key] = buildInstantSeries(conceptPoints(facts, CONCEPTS[key]));
  }

  const annualEnds = sortedDatesDesc(flow.revenue.annual, flow.netIncome.annual);
  const usableAnnualEnds = annualEnds.filter(
    (end) => at(flow, "revenue", "annual", end) != null || at(flow, "netIncome", "annual", end) != null,
  );
  if (usableAnnualEnds.length < 2) return null;

  const buildIncome = (map: "annual" | "quarterly", end: string) => {
    const revenue = at(flow, "revenue", map, end) ?? 0;
    let grossProfit = at(flow, "grossProfit", map, end);
    const costOfRevenue = at(flow, "costOfRevenue", map, end);
    if (grossProfit == null && revenue !== 0 && costOfRevenue != null) {
      grossProfit = revenue - costOfRevenue;
    }
    const operatingIncome = at(flow, "operatingIncome", map, end);
    let operatingExpenses = at(flow, "operatingExpenses", map, end);
    if (operatingExpenses == null && grossProfit != null && operatingIncome != null) {
      operatingExpenses = grossProfit - operatingIncome;
    }
    const da = at(flow, "depreciationAmortization", map, end);
    const ebitda = operatingIncome != null && da != null ? operatingIncome + da : null;
    return {
      revenue,
      grossProfit: grossProfit ?? 0,
      operatingExpenses: operatingExpenses ?? 0,
      netIncome: at(flow, "netIncome", map, end) ?? 0,
      operatingIncome: operatingIncome ?? undefined,
      ebitda: ebitda ?? undefined,
      dilutedEps: at(flow, "dilutedEps", map, end) ?? undefined,
      dilutedAverageShares: at(flow, "dilutedShares", map, end) ?? undefined,
    };
  };

  const income: IncomeStatementAnnual[] = usableAnnualEnds
    .map((end) => ({
      date: end,
      symbol: sym,
      fiscalYear: end.slice(0, 4),
      ...buildIncome("annual", end),
    }))
    .reverse();

  const buildCashFlow = (map: "annual" | "quarterly", end: string) => {
    const operatingCashFlow = at(flow, "operatingCashFlow", map, end);
    const capitalExpenditure = outflowAt(flow, "capitalExpenditure", map, end);
    const freeCashFlow =
      operatingCashFlow != null && capitalExpenditure != null
        ? operatingCashFlow + capitalExpenditure
        : (operatingCashFlow ?? 0);
    return {
      freeCashFlow,
      operatingCashFlow,
      capitalExpenditure,
      investingCashFlow: at(flow, "investingCashFlow", map, end),
      financingCashFlow: at(flow, "financingCashFlow", map, end),
      dividendsPaid: outflowAt(flow, "dividendsPaid", map, end),
      stockRepurchase: outflowAt(flow, "stockRepurchase", map, end),
    };
  };

  const cashFlowEnds = sortedDatesDesc(flow.operatingCashFlow.annual);
  const cashFlow: CashFlowAnnual[] = cashFlowEnds
    .map((end) => ({
      date: end,
      symbol: sym,
      fiscalYear: end.slice(0, 4),
      ...buildCashFlow("annual", end),
    }))
    .reverse();

  const buildBalance = (map: "annual" | "quarterly", end: string) => ({
    totalAssets: instant.totalAssets[map].get(end) ?? null,
    totalDebt: null,
    netDebt: null,
    stockholdersEquity: instant.stockholdersEquity[map].get(end) ?? null,
    cashAndCashEquivalents: instant.cash[map].get(end) ?? null,
    totalCurrentAssets: instant.currentAssets[map].get(end) ?? null,
    totalCurrentLiabilities: instant.currentLiabilities[map].get(end) ?? null,
    inventory: instant.inventory[map].get(end) ?? null,
    accountsReceivable: instant.accountsReceivable[map].get(end) ?? null,
    goodwill: instant.goodwill[map].get(end) ?? null,
    longTermDebt: instant.longTermDebt[map].get(end) ?? null,
  });

  const balanceEnds = sortedDatesDesc(instant.totalAssets.annual, instant.stockholdersEquity.annual);
  const balanceSheet: BalanceSheetAnnual[] = balanceEnds
    .map((end) => ({
      date: end,
      symbol: sym,
      fiscalYear: end.slice(0, 4),
      ...buildBalance("annual", end),
    }))
    .reverse();

  const quarterEnds = sortedDatesDesc(flow.revenue.quarterly, flow.netIncome.quarterly);
  const incomeQuarterly: IncomeStatementQuarter[] = quarterEnds
    .filter(
      (end) =>
        at(flow, "revenue", "quarterly", end) != null ||
        at(flow, "netIncome", "quarterly", end) != null,
    )
    .map((end) => ({ date: end, symbol: sym, ...buildIncome("quarterly", end) }))
    .reverse();

  const cfQuarterEnds = sortedDatesDesc(flow.operatingCashFlow.quarterly);
  const cashFlowQuarterly: CashFlowQuarter[] = cfQuarterEnds
    .map((end) => ({ date: end, symbol: sym, ...buildCashFlow("quarterly", end) }))
    .reverse();

  const bsQuarterEnds = sortedDatesDesc(instant.totalAssets.quarterly);
  const balanceSheetQuarterly: BalanceSheetQuarter[] = bsQuarterEnds
    .map((end) => ({ date: end, symbol: sym, ...buildBalance("quarterly", end) }))
    .reverse();

  return {
    quote: {
      symbol: sym,
      name: facts.entityName?.trim() || sym,
      price: 0,
      change: 0,
      changesPercentage: 0,
    },
    income,
    cashFlow,
    balanceSheet,
    historical: [],
    investor: emptyInvestorMetrics(detectReportingCurrency(facts)),
    incomeQuarterly,
    cashFlowQuarterly,
    balanceSheetQuarterly,
    dividendQuarterly: incomeQuarterly.map((q) => ({ date: q.date, dividendPerShare: null })),
  };
}
