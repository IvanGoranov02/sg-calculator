/**
 * Server-only: US GAAP quarterly fundamentals from SEC EDGAR company facts.
 * Fills long history when Yahoo fundamentalsTimeSeries returns only a few recent quarters.
 */

import {
  isEmptyIncomeStatementCore,
  type BalanceSheetQuarter,
  type CashFlowQuarter,
  type IncomeStatementQuarter,
} from "@/lib/stockAnalysisTypes";

/** SEC requires a descriptive User-Agent; set SEC_EDGAR_USER_AGENT in production. */
const SEC_USER_AGENT =
  process.env.SEC_EDGAR_USER_AGENT?.trim() ||
  "sg-calculator/1.0 (stock dashboard; quarterly fundamentals; contact: admin@example.com)";

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const FACTS_URL = (cikPadded: string) =>
  `https://data.sec.gov/api/xbrl/companyfacts/CIK${cikPadded}.json`;

/** Earliest period end to include (SEC has decades for large filers). */
export const SEC_HISTORY_FROM = "1990-01-01";

type SecFactUnit = {
  start?: string;
  end: string;
  val: number;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
};

type CompanyFactsResponse = {
  facts?: Record<string, Record<string, { units?: Record<string, SecFactUnit[]> }>>;
};

export type SecQuarterlyFundamentals = {
  income: IncomeStatementQuarter[];
  cashFlow: CashFlowQuarter[];
  balanceSheet: BalanceSheetQuarter[];
};

let tickerCikCache: Map<string, number> | null = null;

function maxPeriodEndIso(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function spanDays(start: string | undefined, end: string): number | null {
  if (!start) return null;
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${end}T12:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.abs(b - a) / 86400000;
}

function dedupeLatestByEnd(units: SecFactUnit[]): Map<string, SecFactUnit> {
  const m = new Map<string, SecFactUnit>();
  for (const x of units) {
    if (!x.end) continue;
    const prev = m.get(x.end);
    if (!prev || (x.filed && prev.filed && x.filed > prev.filed)) m.set(x.end, x);
  }
  return m;
}

function quarterly10qFacts(units: SecFactUnit[] | undefined): Map<string, SecFactUnit> {
  if (!units?.length) return new Map();
  const out: SecFactUnit[] = [];
  for (const x of units) {
    if (x.form !== "10-Q") continue;
    const sp = spanDays(x.start, x.end);
    if (sp == null || sp < 80 || sp > 105) continue;
    out.push(x);
  }
  return dedupeLatestByEnd(out);
}

function fyAnnualFacts(units: SecFactUnit[] | undefined): Map<string, SecFactUnit> {
  if (!units?.length) return new Map();
  const out: SecFactUnit[] = [];
  for (const x of units) {
    if (x.fp !== "FY" || x.form !== "10-K") continue;
    if (!x.end) continue;
    out.push(x);
  }
  return dedupeLatestByEnd(out);
}

function pickUsdUnits(
  facts: CompanyFactsResponse | null,
  tagCandidates: string[],
): SecFactUnit[] | undefined {
  const usgaap = facts?.facts?.["us-gaap"];
  if (!usgaap) return undefined;
  for (const tag of tagCandidates) {
    const u = usgaap[tag]?.units?.USD;
    if (u?.length) return u;
  }
  return undefined;
}

async function fetchSecJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": SEC_USER_AGENT },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function getCikForTicker(ticker: string): Promise<number | null> {
  const sym = ticker.trim().toUpperCase();
  if (!tickerCikCache) {
    const raw = await fetchSecJson<Record<string, { ticker: string; cik_str: number }>>(TICKERS_URL);
    if (!raw) return null;
    tickerCikCache = new Map();
    for (const v of Object.values(raw)) {
      if (v?.ticker && v.cik_str != null) {
        tickerCikCache.set(String(v.ticker).toUpperCase(), Number(v.cik_str));
      }
    }
  }
  const cik = tickerCikCache.get(sym);
  return cik != null && Number.isFinite(cik) ? cik : null;
}

/**
 * For each fiscal year-end (FY 10-K), Q4 = FY − Q1 − Q2 − Q3 using 10-Q quarterlies
 * strictly between previous FY end and this FY end.
 */
function addSyntheticQ4(
  fyMap: Map<string, SecFactUnit>,
  qMap: Map<string, SecFactUnit>,
): Map<string, number> {
  const out = new Map<string, number>();
  const fyEnds = [...fyMap.keys()].sort();

  for (let i = 0; i < fyEnds.length; i++) {
    const fyEnd = fyEnds[i];
    const prevEnd = i > 0 ? fyEnds[i - 1] : null;
    const fyVal = fyMap.get(fyEnd)?.val;
    if (prevEnd == null || fyVal == null || !Number.isFinite(fyVal)) continue;

    const qEnds = [...qMap.keys()]
      .filter((e) => e > prevEnd && e < fyEnd)
      .sort();
    if (qEnds.length !== 3) continue;

    const sum = qEnds.reduce((s, e) => s + (qMap.get(e)?.val ?? 0), 0);
    if (!Number.isFinite(sum)) continue;
    out.set(fyEnd, fyVal - sum);
  }
  return out;
}

function mergeQandQ4(q: Map<string, SecFactUnit>, q4: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, v] of q) {
    if (Number.isFinite(v.val)) out.set(k, v.val);
  }
  for (const [k, v] of q4) {
    if (!out.has(k)) out.set(k, v);
  }
  return out;
}

function toIncomeRow(symbol: string, dateIso: string, m: IncomeMetricBundle): IncomeStatementQuarter {
  const revenue = m.revenue ?? 0;
  const grossProfit = m.grossProfit ?? 0;
  const netIncome = m.netIncome ?? 0;
  const opInc = m.operatingIncome;
  let opEx = m.operatingExpenses;
  if (opEx == null && m.grossProfit != null && opInc != null) {
    opEx = Math.max(0, grossProfit - opInc);
  }
  opEx ??= 0;

  const row: IncomeStatementQuarter = {
    date: dateIso,
    symbol,
    revenue,
    grossProfit,
    operatingExpenses: opEx,
    netIncome,
  };
  if (opInc != null && Number.isFinite(opInc)) row.operatingIncome = opInc;
  if (m.ebitda != null && Number.isFinite(m.ebitda)) row.ebitda = m.ebitda;
  return row;
}

type IncomeMetricBundle = {
  revenue: number | null;
  grossProfit: number | null;
  netIncome: number | null;
  operatingIncome: number | null;
  operatingExpenses: number | null;
  ebitda: number | null;
};

const REV_TAGS = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "Revenues",
  "SalesRevenueNet",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
];

const OCF_TAGS = [
  "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
  "NetCashProvidedByUsedInOperatingActivities",
];
const CAPEX_TAGS = ["PaymentsToAcquirePropertyPlantAndEquipment"];
const INV_TAGS = [
  "NetCashProvidedByUsedInInvestingActivitiesContinuingOperations",
  "NetCashProvidedByUsedInInvestingActivities",
];
const FIN_TAGS = [
  "NetCashProvidedByUsedInFinancingActivitiesContinuingOperations",
  "NetCashProvidedByUsedInFinancingActivities",
];
const DIV_PAY_TAGS = ["PaymentsOfDividends", "PaymentsOfDividendsAndDividendEquivalents"];
const BUYBACK_TAGS = ["PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfEquity"];

const BS_ASSETS_TAGS = ["Assets"];
const BS_LIAB_TAGS = ["Liabilities"];
const BS_EQ_TAGS = ["StockholdersEquity"];
const BS_CASH_TAGS = ["CashAndCashEquivalentsAtCarryingValue", "Cash"];
const BS_LT_DEBT_TAGS = ["LongTermDebtNoncurrent", "LongTermDebt"];
const BS_CP_TAGS = ["CommercialPaper"];
const BS_GOODWILL_TAGS = ["Goodwill"];
const BS_INV_TAGS = ["InventoryNet"];
const BS_AR_TAGS = ["AccountsReceivableNetCurrent", "AccountsReceivableNet"];
const BS_CA_TAGS = ["AssetsCurrent"];
const BS_CL_TAGS = ["LiabilitiesCurrent"];

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildCashFlowRow(
  sym: string,
  dateIso: string,
  ocf: number | null,
  capex: number | null,
  inv: number | null,
  fin: number | null,
  div: number | null,
  buyback: number | null,
  netIncomeFallback: number,
): CashFlowQuarter {
  let freeCashFlow: number;
  if (ocf != null && capex != null && Number.isFinite(ocf) && Number.isFinite(capex)) {
    freeCashFlow = ocf + capex;
  } else if (ocf != null && Number.isFinite(ocf)) {
    freeCashFlow = ocf;
  } else {
    freeCashFlow = Math.max(0, netIncomeFallback * 0.85);
  }
  return {
    date: dateIso,
    symbol: sym,
    freeCashFlow,
    operatingCashFlow: ocf,
    capitalExpenditure: capex,
    investingCashFlow: inv,
    financingCashFlow: fin,
    dividendsPaid: div,
    stockRepurchase: buyback,
  };
}

function buildBalanceRow(
  sym: string,
  dateIso: string,
  assets: number | null,
  liab: number | null,
  equity: number | null,
  cash: number | null,
  ltDebt: number | null,
  cp: number | null,
  goodwill: number | null,
  inventory: number | null,
  ar: number | null,
  ca: number | null,
  cl: number | null,
): BalanceSheetQuarter {
  let totalDebt: number | null = null;
  const lt = ltDebt ?? null;
  const paper = cp ?? null;
  if (lt != null || paper != null) {
    totalDebt = (lt ?? 0) + (paper ?? 0);
  }
  let netDebt: number | null = null;
  if (totalDebt != null && cash != null) netDebt = totalDebt - cash;

  return {
    date: dateIso,
    symbol: sym,
    totalAssets: assets,
    totalDebt,
    netDebt,
    stockholdersEquity: equity,
    cashAndCashEquivalents: cash,
    totalCurrentAssets: ca,
    totalCurrentLiabilities: cl,
    inventory,
    accountsReceivable: ar,
    goodwill,
    longTermDebt: ltDebt,
  };
}

/**
 * Income + cash flow + balance sheet from SEC (US listings), aligned by fiscal quarter end.
 * Uses full available history in SEC_HISTORY_FROM … ~next year.
 */
export async function fetchSecQuarterlyFundamentals(
  symbol: string,
): Promise<SecQuarterlyFundamentals | null> {
  const sym = symbol.trim().toUpperCase();
  const cik = await getCikForTicker(sym);
  if (cik == null) return null;

  const cikPadded = String(cik).padStart(10, "0");
  const facts = (await fetchSecJson<CompanyFactsResponse>(FACTS_URL(cikPadded))) ?? null;
  if (!facts?.facts) return null;

  const revU = pickUsdUnits(facts, REV_TAGS);
  const niU = pickUsdUnits(facts, ["NetIncomeLoss"]);
  const gpU = pickUsdUnits(facts, ["GrossProfit"]);
  const oiU = pickUsdUnits(facts, ["OperatingIncomeLoss"]);
  const opexU = pickUsdUnits(facts, ["OperatingExpenses"]);
  const ebitdaU = pickUsdUnits(facts, [
    "EarningsBeforeInterestTaxesDepreciationAmortization",
    "EarningsBeforeInterestTaxDepreciationAndAmortization",
  ]);

  const ocfU = pickUsdUnits(facts, OCF_TAGS);
  const capexU = pickUsdUnits(facts, CAPEX_TAGS);
  const invU = pickUsdUnits(facts, INV_TAGS);
  const finU = pickUsdUnits(facts, FIN_TAGS);
  const divU = pickUsdUnits(facts, DIV_PAY_TAGS);
  const buyU = pickUsdUnits(facts, BUYBACK_TAGS);

  const assetsU = pickUsdUnits(facts, BS_ASSETS_TAGS);
  const liabU = pickUsdUnits(facts, BS_LIAB_TAGS);
  const eqU = pickUsdUnits(facts, BS_EQ_TAGS);
  const cashU = pickUsdUnits(facts, BS_CASH_TAGS);
  const ltDebtU = pickUsdUnits(facts, BS_LT_DEBT_TAGS);
  const cpU = pickUsdUnits(facts, BS_CP_TAGS);
  const gwU = pickUsdUnits(facts, BS_GOODWILL_TAGS);
  const invnU = pickUsdUnits(facts, BS_INV_TAGS);
  const arU = pickUsdUnits(facts, BS_AR_TAGS);
  const caU = pickUsdUnits(facts, BS_CA_TAGS);
  const clU = pickUsdUnits(facts, BS_CL_TAGS);

  if (!revU?.length && !niU?.length) return null;

  const seriesSpecs: {
    q: Map<string, SecFactUnit>;
    fy: Map<string, SecFactUnit>;
  }[] = [];

  const addSeries = (u: SecFactUnit[] | undefined) => {
    if (!u?.length) return;
    seriesSpecs.push({ q: quarterly10qFacts(u), fy: fyAnnualFacts(u) });
  };

  addSeries(revU);
  addSeries(niU);
  addSeries(gpU);
  addSeries(oiU);
  addSeries(opexU);
  addSeries(ebitdaU);
  addSeries(ocfU);
  addSeries(capexU);
  addSeries(invU);
  addSeries(finU);
  addSeries(divU);
  addSeries(buyU);
  addSeries(assetsU);
  addSeries(liabU);
  addSeries(eqU);
  addSeries(cashU);
  addSeries(ltDebtU);
  addSeries(cpU);
  addSeries(gwU);
  addSeries(invnU);
  addSeries(arU);
  addSeries(caU);
  addSeries(clU);

  const allEnds = new Set<string>();
  for (const { q, fy } of seriesSpecs) {
    const q4 = addSyntheticQ4(fy, q);
    for (const k of q.keys()) allEnds.add(k);
    for (const k of q4.keys()) allEnds.add(k);
  }

  const maxEnd = maxPeriodEndIso();
  const sortedEnds = [...allEnds]
    .filter((e) => e >= SEC_HISTORY_FROM && e <= maxEnd)
    .sort();

  if (sortedEnds.length < 4) return null;

  const revQ = quarterly10qFacts(revU);
  const niQ = quarterly10qFacts(niU);
  const gpQ = quarterly10qFacts(gpU);
  const oiQ = quarterly10qFacts(oiU);
  const opexQ = quarterly10qFacts(opexU);
  const ebitdaQ = quarterly10qFacts(ebitdaU);

  const revFY = fyAnnualFacts(revU);
  const niFY = fyAnnualFacts(niU);
  const gpFY = fyAnnualFacts(gpU);
  const oiFY = fyAnnualFacts(oiU);
  const opexFY = fyAnnualFacts(opexU);
  const ebitdaFY = fyAnnualFacts(ebitdaU);

  const revM = mergeQandQ4(revQ, addSyntheticQ4(revFY, revQ));
  const niM = mergeQandQ4(niQ, addSyntheticQ4(niFY, niQ));
  const gpM = mergeQandQ4(gpQ, addSyntheticQ4(gpFY, gpQ));
  const oiM = mergeQandQ4(oiQ, addSyntheticQ4(oiFY, oiQ));
  const opexM = mergeQandQ4(opexQ, addSyntheticQ4(opexFY, opexQ));
  const ebitdaM = mergeQandQ4(ebitdaQ, addSyntheticQ4(ebitdaFY, ebitdaQ));

  const ocfQ = quarterly10qFacts(ocfU);
  const ocfFY = fyAnnualFacts(ocfU);
  const ocfM = mergeQandQ4(ocfQ, addSyntheticQ4(ocfFY, ocfQ));

  const capexQ = quarterly10qFacts(capexU);
  const capexFY = fyAnnualFacts(capexU);
  const capexM = mergeQandQ4(capexQ, addSyntheticQ4(capexFY, capexQ));

  const invQ = quarterly10qFacts(invU);
  const invFY = fyAnnualFacts(invU);
  const invM = mergeQandQ4(invQ, addSyntheticQ4(invFY, invQ));

  const finQ = quarterly10qFacts(finU);
  const finFY = fyAnnualFacts(finU);
  const finM = mergeQandQ4(finQ, addSyntheticQ4(finFY, finQ));

  const divQ = quarterly10qFacts(divU);
  const divFY = fyAnnualFacts(divU);
  const divM = mergeQandQ4(divQ, addSyntheticQ4(divFY, divQ));

  const buyQ = quarterly10qFacts(buyU);
  const buyFY = fyAnnualFacts(buyU);
  const buyM = mergeQandQ4(buyQ, addSyntheticQ4(buyFY, buyQ));

  const assetsQ = quarterly10qFacts(assetsU);
  const assetsFY = fyAnnualFacts(assetsU);
  const assetsM = mergeQandQ4(assetsQ, addSyntheticQ4(assetsFY, assetsQ));

  const liabQ = quarterly10qFacts(liabU);
  const liabFY = fyAnnualFacts(liabU);
  const liabM = mergeQandQ4(liabQ, addSyntheticQ4(liabFY, liabQ));

  const eqQ = quarterly10qFacts(eqU);
  const eqFY = fyAnnualFacts(eqU);
  const eqM = mergeQandQ4(eqQ, addSyntheticQ4(eqFY, eqQ));

  const cashQ = quarterly10qFacts(cashU);
  const cashFY = fyAnnualFacts(cashU);
  const cashM = mergeQandQ4(cashQ, addSyntheticQ4(cashFY, cashQ));

  const ltQ = quarterly10qFacts(ltDebtU);
  const ltFY = fyAnnualFacts(ltDebtU);
  const ltM = mergeQandQ4(ltQ, addSyntheticQ4(ltFY, ltQ));

  const cpQ = quarterly10qFacts(cpU);
  const cpFY = fyAnnualFacts(cpU);
  const cpM = mergeQandQ4(cpQ, addSyntheticQ4(cpFY, cpQ));

  const gwQ = quarterly10qFacts(gwU);
  const gwFY = fyAnnualFacts(gwU);
  const gwM = mergeQandQ4(gwQ, addSyntheticQ4(gwFY, gwQ));

  const invnQ = quarterly10qFacts(invnU);
  const invnFY = fyAnnualFacts(invnU);
  const invnM = mergeQandQ4(invnQ, addSyntheticQ4(invnFY, invnQ));

  const arQ = quarterly10qFacts(arU);
  const arFY = fyAnnualFacts(arU);
  const arM = mergeQandQ4(arQ, addSyntheticQ4(arFY, arQ));

  const caQ = quarterly10qFacts(caU);
  const caFY = fyAnnualFacts(caU);
  const caM = mergeQandQ4(caQ, addSyntheticQ4(caFY, caQ));

  const clQ = quarterly10qFacts(clU);
  const clFY = fyAnnualFacts(clU);
  const clM = mergeQandQ4(clQ, addSyntheticQ4(clFY, clQ));

  const incomeRows: IncomeStatementQuarter[] = [];

  for (const end of sortedEnds) {
    const revenue = revM.get(end) ?? null;
    const netIncome = niM.get(end) ?? null;
    const grossProfit = gpM.get(end) ?? null;
    const operatingIncome = oiM.get(end) ?? null;
    const operatingExpenses = opexM.get(end) ?? null;
    const ebitda = ebitdaM.get(end) ?? null;

    const ib: IncomeMetricBundle = {
      revenue: revenue != null && Number.isFinite(revenue) ? revenue : null,
      grossProfit: grossProfit != null && Number.isFinite(grossProfit) ? grossProfit : null,
      netIncome: netIncome != null && Number.isFinite(netIncome) ? netIncome : null,
      operatingIncome:
        operatingIncome != null && Number.isFinite(operatingIncome) ? operatingIncome : null,
      operatingExpenses:
        operatingExpenses != null && Number.isFinite(operatingExpenses) ? operatingExpenses : null,
      ebitda: ebitda != null && Number.isFinite(ebitda) ? ebitda : null,
    };

    if (ib.revenue == null && ib.netIncome == null && ib.grossProfit == null) continue;

    incomeRows.push(toIncomeRow(sym, end, ib));
  }

  const incomeNonEmpty = incomeRows.filter((r) => !isEmptyIncomeStatementCore(r));
  if (incomeNonEmpty.length < 4) return null;

  const dates = [...new Set(incomeNonEmpty.map((r) => r.date))].sort();

  const cashFlow: CashFlowQuarter[] = dates.map((d) => {
    const niRow = incomeNonEmpty.find((r) => r.date === d);
    const ni = niRow?.netIncome ?? 0;
    return buildCashFlowRow(
      sym,
      d,
      numOrNull(ocfM.get(d)),
      numOrNull(capexM.get(d)),
      numOrNull(invM.get(d)),
      numOrNull(finM.get(d)),
      numOrNull(divM.get(d)),
      numOrNull(buyM.get(d)),
      ni,
    );
  });

  const balanceSheet: BalanceSheetQuarter[] = dates.map((d) =>
    buildBalanceRow(
      sym,
      d,
      numOrNull(assetsM.get(d)),
      numOrNull(liabM.get(d)),
      numOrNull(eqM.get(d)),
      numOrNull(cashM.get(d)),
      numOrNull(ltM.get(d)),
      numOrNull(cpM.get(d)),
      numOrNull(gwM.get(d)),
      numOrNull(invnM.get(d)),
      numOrNull(arM.get(d)),
      numOrNull(caM.get(d)),
      numOrNull(clM.get(d)),
    ),
  );

  return {
    income: dates.map((d) => incomeNonEmpty.find((r) => r.date === d)!),
    cashFlow,
    balanceSheet,
  };
}

/** @deprecated Prefer fetchSecQuarterlyFundamentals — kept for direct callers. */
export async function fetchSecQuarterlyIncome(
  symbol: string,
): Promise<IncomeStatementQuarter[] | null> {
  const f = await fetchSecQuarterlyFundamentals(symbol);
  return f?.income ?? null;
}
