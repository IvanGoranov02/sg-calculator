/**
 * Permanent fundamentals store, pure part: one row = one company + one period (a fiscal
 * year or a quarter) with all three statements. Rows are built by merging the two free
 * sources (SEC filings, Yahoo) period by period; each row carries how far it can be trusted.
 * No network and no database here.
 */

import type { BankSeries } from "@/lib/edgar/normalize";
import type {
  BalanceSheetAnnual,
  BalanceSheetQuarter,
  BankLines,
  BankPeriod,
  CashFlowAnnual,
  CashFlowQuarter,
  DividendQuarterlyPoint,
  IncomeStatementAnnual,
  IncomeStatementQuarter,
  StockAnalysisBundle,
} from "@/lib/stockAnalysisTypes";
import type { VerifiedStatements } from "@/lib/verified/verify";
import type { Bs, Cf, Fin, YahooFundamentalsPayload } from "@/lib/yahooFundamentalsMerge";

/**
 * verified = filing and second source agree · filed = from the filing, second source has no
 * such period · disputed = both exist and disagree (the filing is kept) · single = one
 * source only (Yahoo), nothing to compare with.
 */
export type Trust = "verified" | "filed" | "disputed" | "single";
export type PeriodKind = "A" | "Q";
export type PeriodSource = "sec" | "yahoo" | "sec+yahoo";

const TRUST_RANK: Record<Trust, number> = { single: 1, disputed: 2, filed: 2, verified: 3 };

type IncLines = Omit<IncomeStatementQuarter, "date" | "symbol">;
type CfLines = Omit<CashFlowQuarter, "date" | "symbol">;
type BsLines = Omit<BalanceSheetQuarter, "date" | "symbol">;

export type PeriodData = {
  inc: IncLines;
  cf?: CfLines;
  bs?: BsLines;
  dps?: number | null;
  bank?: BankLines;
};

export type PeriodRow = {
  symbol: string;
  kind: PeriodKind;
  /** Period end, YYYY-MM-DD. */
  end: string;
  trust: Trust;
  source: PeriodSource;
  data: PeriodData;
};

export type MergeIssue = { code: string; message: string };

const DAY_MS = 86_400_000;
const MATCH_DAYS = 10;
const CROSS_TOLERANCE = 0.02;
const SUM_TOLERANCE = 0.01;

const d10 = (s: string) => s.slice(0, 10);
const dayGap = (a: string, b: string) => Math.round((Date.parse(d10(b)) - Date.parse(d10(a))) / DAY_MS);
const fin = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function agrees(a: number, b: number, tol: number, scale = 0): boolean {
  const diff = Math.abs(a - b);
  if (diff <= Math.abs(scale) * 0.003) return true;
  const base = Math.max(Math.abs(a), Math.abs(b));
  return base === 0 ? true : diff / base <= tol;
}

function nearestBy<T>(rows: T[], dateOf: (r: T) => string, target: string, maxDays = MATCH_DAYS): T | null {
  let best: T | null = null;
  let bestGap = Infinity;
  for (const r of rows) {
    const gap = Math.abs(dayGap(dateOf(r), target));
    if (gap <= maxDays && gap < bestGap) {
      best = r;
      bestGap = gap;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Sources → one comparable shape                                       */
/* ------------------------------------------------------------------ */

export type SourcePeriod = {
  kind: PeriodKind;
  end: string;
  data: PeriodData;
  /** Banks: the revenue line as the source itself reports it (definitions differ between sources). */
  altRevenue?: number;
};

function strip<T extends { date: string; symbol: string }>(row: T): Omit<T, "date" | "symbol" | "fiscalYear"> {
  const rest = { ...row } as Record<string, unknown>;
  delete rest.date;
  delete rest.symbol;
  delete rest.fiscalYear;
  return rest as Omit<T, "date" | "symbol" | "fiscalYear">;
}

function usableIncome(inc: { revenue: number; netIncome: number }): boolean {
  return (Number.isFinite(inc.revenue) && inc.revenue !== 0) || (Number.isFinite(inc.netIncome) && inc.netIncome !== 0);
}

/** Periods of SEC-built statements (plus bank lines when the company reports like a bank). */
export function secPeriods(s: VerifiedStatements, bank: BankSeries | null): SourcePeriod[] {
  const out: SourcePeriod[] = [];
  const bankAt = (map: Map<string, BankLines> | undefined, end: string): BankLines | undefined => {
    if (!map) return undefined;
    const exact = map.get(end);
    if (exact) return exact;
    const key = nearestBy([...map.keys()], (k) => k, end, 3);
    return key ? map.get(key) : undefined;
  };
  for (const inc of s.income) {
    if (!usableIncome(inc)) continue;
    const end = d10(inc.date);
    const cf = s.cashFlow.find((c) => c.fiscalYear === inc.fiscalYear);
    const bs = s.balanceSheet.find((b) => b.fiscalYear === inc.fiscalYear);
    out.push({
      kind: "A",
      end,
      data: { inc: strip(inc), cf: cf ? strip(cf) : undefined, bs: bs ? strip(bs) : undefined, bank: bankAt(bank?.annual, end) },
    });
  }
  for (const inc of s.incomeQuarterly) {
    if (!usableIncome(inc)) continue;
    const end = d10(inc.date);
    const cf = nearestBy(s.cashFlowQuarterly, (c) => c.date, end, 3);
    const bs = nearestBy(s.balanceSheetQuarterly, (b) => b.date, end, 3);
    out.push({
      kind: "Q",
      end,
      data: { inc: strip(inc), cf: cf ? strip(cf) : undefined, bs: bs ? strip(bs) : undefined, bank: bankAt(bank?.quarterly, end) },
    });
  }
  return out;
}

const isoOf = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);

function yahooBank(f: Fin | null, b: Bs | null): BankLines | undefined {
  const fr = (f ?? {}) as Record<string, unknown>;
  const br = (b ?? {}) as Record<string, unknown>;
  const nii = fin(fr.netInterestIncome);
  const deposits = fin(br.totalDeposits);
  if (nii == null && deposits == null) return undefined;
  const provision = fin(fr.creditLossesProvision);
  return {
    netInterestIncome: nii,
    nonInterestIncome: fin(fr.nonInterestIncome),
    nonInterestExpense: fin(fr.nonInterestExpense),
    // Yahoo reports the provision as a negative (a cost); the store keeps it positive.
    provisionForCreditLosses: provision == null ? null : -provision,
    deposits,
    loans: fin(br.netLoan),
  };
}

/** Periods from the Yahoo payload (about 4 fiscal years and 5 quarters). */
export function yahooPeriods(y: YahooFundamentalsPayload): SourcePeriod[] {
  const out: SourcePeriod[] = [];
  const build = (kind: PeriodKind, fins: Fin[], cfs: Cf[], bss: Bs[]) => {
    for (const f of fins) {
      if (!f?.date) continue;
      const end = isoOf(f.date);
      const inc: IncLines = {
        revenue: fin(f.totalRevenue) ?? 0,
        grossProfit: fin(f.grossProfit) ?? 0,
        operatingExpenses: fin(f.operatingExpense) ?? 0,
        netIncome: fin(f.netIncome) ?? 0,
        operatingIncome: fin(f.operatingIncome) ?? undefined,
        ebitda: fin(f.EBITDA) ?? undefined,
        dilutedEps: fin(f.dilutedEPS) ?? undefined,
        dilutedAverageShares: fin(f.dilutedAverageShares) ?? undefined,
      };
      if (!usableIncome(inc)) continue;
      const c = nearestBy(cfs, (r) => isoOf(r.date), end, 3);
      const b = nearestBy(bss, (r) => isoOf(r.date), end, 3);
      const ocf = fin(c?.operatingCashFlow);
      const capex = fin(c?.capitalExpenditure);
      const lease =
        fin(b?.capitalLeaseObligations) ??
        (fin(b?.currentCapitalLeaseObligation) != null || fin(b?.longTermCapitalLeaseObligation) != null
          ? (fin(b?.currentCapitalLeaseObligation) ?? 0) + (fin(b?.longTermCapitalLeaseObligation) ?? 0)
          : null);
      out.push({
        kind,
        end,
        data: {
          inc,
          cf: c
            ? {
                freeCashFlow: fin(c.freeCashFlow) ?? (ocf != null && capex != null ? ocf + capex : (ocf ?? 0)),
                operatingCashFlow: ocf,
                capitalExpenditure: capex,
                investingCashFlow: fin(c.investingCashFlow),
                financingCashFlow: fin(c.financingCashFlow),
                dividendsPaid: fin(c.cashDividendsPaid),
                stockRepurchase: fin(c.commonStockRepurchased),
              }
            : undefined,
          bs: b
            ? {
                totalAssets: fin(b.totalAssets),
                totalDebt: fin(b.totalDebt),
                netDebt: fin(b.netDebt),
                stockholdersEquity: fin(b.stockholdersEquity),
                cashAndCashEquivalents: fin(b.cashAndCashEquivalents),
                totalCurrentAssets: fin(b.currentAssets),
                totalCurrentLiabilities: fin(b.currentLiabilities),
                inventory: fin(b.inventory),
                accountsReceivable: fin(b.accountsReceivable),
                goodwill: fin(b.goodwill),
                longTermDebt: fin(b.longTermDebt),
                capitalLeaseObligations: lease,
              }
            : undefined,
          dps: kind === "Q" ? fin(f.dividendPerShare) : undefined,
          bank: yahooBank(f, b),
        },
      });
    }
  };
  build("A", y.finA, y.cfA, y.bsA);
  build("Q", y.finQ, y.cfQ, y.bsQ);
  return out;
}

/* ------------------------------------------------------------------ */
/* Banks                                                                */
/* ------------------------------------------------------------------ */

/** A company reports like a bank when deposits fund a real share of its balance sheet. */
export function looksLikeBank(periods: SourcePeriod[]): boolean {
  const annual = periods.filter((p) => p.kind === "A").sort((a, b) => a.end.localeCompare(b.end));
  const last = annual[annual.length - 1];
  const b = last?.data.bank;
  const assets = last?.data.bs?.totalAssets;
  if (!b || b.netInterestIncome == null || b.deposits == null || !assets) return false;
  return b.deposits / assets >= 0.2;
}

/** Bank lines only make sense for banks; other companies tag stray interest lines. */
export function dropBankLines(periods: SourcePeriod[]): void {
  for (const p of periods) delete p.data.bank;
}

/**
 * Banks have no "sales". Their revenue is net interest income + non-interest income, and
 * gross profit / operating expenses in the usual sense do not exist. Applied to both
 * sources so they are compared on the same definition.
 */
export function applyBankTemplate(periods: SourcePeriod[]): void {
  for (const p of periods) {
    const b = p.data.bank;
    if (!b) continue;
    if (b.netInterestIncome != null && b.nonInterestIncome != null) {
      if (p.data.inc.revenue !== 0) p.altRevenue = p.data.inc.revenue;
      p.data.inc.revenue = b.netInterestIncome + b.nonInterestIncome;
    }
    p.data.inc.grossProfit = 0;
    if (b.nonInterestExpense != null) p.data.inc.operatingExpenses = b.nonInterestExpense;
  }
}

/* ------------------------------------------------------------------ */
/* Merge                                                                */
/* ------------------------------------------------------------------ */

/** Zero means "not reported" for these non-nullable lines. */
const ZERO_IS_MISSING = new Set(["revenue", "grossProfit", "operatingExpenses", "netIncome", "freeCashFlow"]);

function fillGaps<T extends object>(primary: T | undefined, secondary: T | undefined): T | undefined {
  if (!primary) return secondary ? { ...secondary } : undefined;
  if (!secondary) return primary;
  const out = { ...primary } as Record<string, unknown>;
  for (const [k, v] of Object.entries(secondary)) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const cur = out[k];
    if (cur == null || (cur === 0 && ZERO_IS_MISSING.has(k))) out[k] = v;
  }
  return out as T;
}

function mergeData(primary: PeriodData, secondary: PeriodData, bank: boolean): PeriodData {
  const inc = fillGaps(primary.inc, secondary.inc) as IncLines;
  if (bank) inc.grossProfit = 0;
  return {
    inc,
    cf: fillGaps(primary.cf, secondary.cf),
    bs: fillGaps(primary.bs, secondary.bs),
    dps: primary.dps ?? secondary.dps,
    bank: fillGaps(primary.bank, secondary.bank),
  };
}

/** Compare the core lines both sources report. null = nothing comparable. */
function crossCheck(a: PeriodData, b: PeriodData, altRevenueB?: number): { compared: number; mismatches: string[] } {
  const mismatches: string[] = [];
  let compared = 0;
  const scale = Math.abs(a.inc.revenue) || Math.abs(b.inc.revenue);
  const cmp = (label: string, x: number | null | undefined, y: number | null | undefined, floor: number, zeroMissing = false) => {
    const p = fin(x);
    const q = fin(y);
    if (p == null || q == null) return;
    if (zeroMissing && (p === 0 || q === 0)) return;
    compared++;
    if (!agrees(p, q, CROSS_TOLERANCE, floor)) mismatches.push(`${label}: filing ${p}, second source ${q}`);
  };
  // Banks: accept the second source's own revenue line as well as the rebuilt one.
  const altOk = altRevenueB != null && a.inc.revenue !== 0 && agrees(a.inc.revenue, altRevenueB, CROSS_TOLERANCE);
  if (altOk) compared++;
  else cmp("revenue", a.inc.revenue, b.inc.revenue, scale, true);
  cmp("net income", a.inc.netIncome, b.inc.netIncome, scale, true);
  cmp("operating cash flow", a.cf?.operatingCashFlow, b.cf?.operatingCashFlow, scale);
  cmp("total assets", a.bs?.totalAssets, b.bs?.totalAssets, 0);
  return { compared, mismatches };
}

/** The second source dates some periods at the month end instead of the real fiscal end. */
const LOOSE_MATCH_DAYS = 31;

/**
 * The same period in another list: within a few days, or (differently dated by the source)
 * within a month with the same revenue and net income.
 */
function findSamePeriod<T extends { end: string; data: PeriodData }>(list: T[], end: string, data: PeriodData): T | null {
  const near = nearestBy(list, (p) => p.end, end);
  if (near) return near;
  for (const cand of list) {
    if (Math.abs(dayGap(cand.end, end)) > LOOSE_MATCH_DAYS) continue;
    const a = cand.data.inc;
    const b = data.inc;
    if (a.revenue === 0 || b.revenue === 0 || a.netIncome === 0 || b.netIncome === 0) continue;
    if (agrees(a.revenue, b.revenue, CROSS_TOLERANCE) && agrees(a.netIncome, b.netIncome, CROSS_TOLERANCE, a.revenue)) return cand;
  }
  return null;
}

/**
 * Quarter ends of fiscal years whose four filed quarters do NOT add up to the filed year
 * (revenue or net income). Those quarters were reconstructed wrongly somewhere, so the
 * filing is not trusted over the second source for them.
 */
export function quartersFailingYearSum(sec: SourcePeriod[]): Set<string> {
  const bad = new Set<string>();
  const quarters = sec.filter((p) => p.kind === "Q");
  for (const fy of sec.filter((p) => p.kind === "A")) {
    const qs = quarters.filter((q) => {
      const d = dayGap(q.end, fy.end);
      return d >= -3 && d < 360;
    });
    if (qs.length !== 4) continue;
    const rev = qs.reduce((a, q) => a + q.data.inc.revenue, 0);
    const ni = qs.reduce((a, q) => a + q.data.inc.netIncome, 0);
    const ok =
      agrees(rev, fy.data.inc.revenue, SUM_TOLERANCE) && agrees(ni, fy.data.inc.netIncome, SUM_TOLERANCE, fy.data.inc.revenue);
    if (!ok) for (const q of qs) bad.add(q.end);
  }
  return bad;
}

export type MergeResult = { rows: PeriodRow[]; issues: MergeIssue[]; crossChecked: number };

/** Merge the two sources into store rows, one per period, each with its trust level. */
export function mergePeriods(
  symbol: string,
  sec: SourcePeriod[],
  yahoo: SourcePeriod[],
  opts?: { bank?: boolean },
): MergeResult {
  const bank = opts?.bank === true;
  const rows: PeriodRow[] = [];
  const issues: MergeIssue[] = [];
  let crossChecked = 0;
  const usedYahoo = new Set<SourcePeriod>();
  const badQuarters = quartersFailingYearSum(sec);

  for (const s of sec) {
    const y = findSamePeriod(
      yahoo.filter((p) => p.kind === s.kind && !usedYahoo.has(p)),
      s.end,
      s.data,
    );
    const sumFailed = s.kind === "Q" && badQuarters.has(s.end);
    if (!y) {
      rows.push({ symbol, kind: s.kind, end: s.end, trust: sumFailed ? "disputed" : "filed", source: "sec", data: s.data });
      if (sumFailed) issues.push({ code: "sum_mismatch", message: `${s.end}: the quarters of this fiscal year do not add up to the annual report.` });
      continue;
    }
    usedYahoo.add(y);
    const check = crossCheck(s.data, y.data, y.altRevenue);
    crossChecked += check.compared;
    if (check.compared > 0 && check.mismatches.length === 0) {
      rows.push({ symbol, kind: s.kind, end: s.end, trust: "verified", source: "sec+yahoo", data: mergeData(s.data, y.data, bank) });
    } else if (check.compared === 0) {
      rows.push({ symbol, kind: s.kind, end: s.end, trust: "filed", source: "sec+yahoo", data: mergeData(s.data, y.data, bank) });
    } else if (sumFailed) {
      // The filing-derived quarter is internally inconsistent: the second source is the safer figure.
      rows.push({ symbol, kind: s.kind, end: s.end, trust: "single", source: "yahoo", data: mergeData(y.data, s.data, bank) });
      issues.push({ code: "sum_mismatch", message: `${s.end}: filed quarters do not add up to the year; second source used.` });
    } else {
      rows.push({ symbol, kind: s.kind, end: s.end, trust: "disputed", source: "sec+yahoo", data: mergeData(s.data, y.data, bank) });
      issues.push({ code: "cross_mismatch", message: `${s.kind === "A" ? "FY " : ""}${s.end} ${check.mismatches[0]}.` });
    }
  }
  for (const y of yahoo) {
    if (usedYahoo.has(y)) continue;
    // A Yahoo period sitting next to an already-stored filing period is the same period.
    if (findSamePeriod(rows.filter((r) => r.kind === y.kind), y.end, y.data)) continue;
    rows.push({ symbol, kind: y.kind, end: y.end, trust: "single", source: "yahoo", data: y.data });
  }
  rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.end.localeCompare(b.end));
  return { rows, issues, crossChecked };
}

/* ------------------------------------------------------------------ */
/* Stored rows are permanent                                            */
/* ------------------------------------------------------------------ */

export type StoreChanges = { upserts: PeriodRow[]; deletes: { kind: PeriodKind; end: string }[] };

/**
 * What to write given what is already stored. A stored period is never rewritten, with one
 * exception: a better-confirmed version replaces a weaker one (single → filed → verified).
 * Stored periods the sources no longer return are kept: history only grows.
 * `force` (admin rebuild / normalizer upgrade) replaces every period the sources return.
 */
export function planStoreChanges(existing: PeriodRow[], fresh: PeriodRow[], force = false): StoreChanges {
  const upserts: PeriodRow[] = [];
  const deletes: { kind: PeriodKind; end: string }[] = [];
  for (const f of fresh) {
    const old = findSamePeriod(
      existing.filter((e) => e.kind === f.kind),
      f.end,
      f.data,
    );
    if (!old) {
      upserts.push(f);
      continue;
    }
    if (!force && TRUST_RANK[f.trust] <= TRUST_RANK[old.trust]) continue;
    if (old.end !== f.end) deletes.push({ kind: old.kind, end: old.end });
    upserts.push(f);
  }
  return { upserts, deletes };
}

/** Rows after applying a plan (what the table will contain). */
export function applyStoreChanges(existing: PeriodRow[], changes: StoreChanges): PeriodRow[] {
  const gone = new Set(changes.deletes.map((d) => `${d.kind}|${d.end}`));
  const byKey = new Map<string, PeriodRow>();
  for (const e of existing) if (!gone.has(`${e.kind}|${e.end}`)) byKey.set(`${e.kind}|${e.end}`, e);
  for (const u of changes.upserts) byKey.set(`${u.kind}|${u.end}`, u);
  return [...byKey.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.end.localeCompare(b.end));
}

/* ------------------------------------------------------------------ */
/* Rows → what the page needs                                           */
/* ------------------------------------------------------------------ */

export type StoreCoverage = {
  annual: number;
  quarters: number;
  /** Quarters in an unbroken run counting back from the newest one. */
  contiguousQuarters: number;
  latestQuarter: string | null;
  latestAnnual: string | null;
  verified: number;
  total: number;
  /** Enough unbroken history to serve the page from the store alone. */
  full: boolean;
};

export const FULL_MIN_ANNUAL = 3;
export const FULL_MIN_QUARTERS = 12;
const WINDOW_QUARTERS = 20;

export function storeCoverage(rows: PeriodRow[]): StoreCoverage {
  const annual = rows.filter((r) => r.kind === "A").sort((a, b) => a.end.localeCompare(b.end));
  const quarters = rows.filter((r) => r.kind === "Q").sort((a, b) => a.end.localeCompare(b.end));
  const recent = quarters.slice(-WINDOW_QUARTERS);
  let contiguous = recent.length ? 1 : 0;
  for (let i = recent.length - 1; i > 0; i--) {
    const gap = dayGap(recent[i - 1].end, recent[i].end);
    if (gap < 75 || gap > 125) break;
    contiguous++;
  }
  return {
    annual: annual.length,
    quarters: quarters.length,
    contiguousQuarters: contiguous,
    latestQuarter: quarters.length ? quarters[quarters.length - 1].end : null,
    latestAnnual: annual.length ? annual[annual.length - 1].end : null,
    verified: rows.filter((r) => r.trust === "verified").length,
    total: rows.length,
    full: annual.length >= FULL_MIN_ANNUAL && contiguous >= FULL_MIN_QUARTERS && contiguous === recent.length,
  };
}

export type StoreStatements = VerifiedStatements & {
  dividendQuarterly: DividendQuarterlyPoint[];
  bank?: { annual: BankPeriod[]; quarterly: BankPeriod[] };
};

const EMPTY_CF: CfLines = {
  freeCashFlow: 0,
  operatingCashFlow: null,
  capitalExpenditure: null,
  investingCashFlow: null,
  financingCashFlow: null,
  dividendsPaid: null,
  stockRepurchase: null,
};

const EMPTY_BS: BsLines = {
  totalAssets: null,
  totalDebt: null,
  netDebt: null,
  stockholdersEquity: null,
  cashAndCashEquivalents: null,
  totalCurrentAssets: null,
  totalCurrentLiabilities: null,
  inventory: null,
  accountsReceivable: null,
  goodwill: null,
  longTermDebt: null,
};

/** Statement arrays (oldest first) in the shape the rest of the site uses. */
export function rowsToStatements(symbol: string, name: string, currency: string, rows: PeriodRow[]): StoreStatements {
  const annual = rows.filter((r) => r.kind === "A").sort((a, b) => a.end.localeCompare(b.end));
  const quarters = rows.filter((r) => r.kind === "Q").sort((a, b) => a.end.localeCompare(b.end));
  const fy = (r: PeriodRow) => r.end.slice(0, 4);
  const income: IncomeStatementAnnual[] = annual.map((r) => ({ date: r.end, symbol, fiscalYear: fy(r), ...r.data.inc }));
  const cashFlow: CashFlowAnnual[] = annual.map((r) => ({ date: r.end, symbol, fiscalYear: fy(r), ...(r.data.cf ?? EMPTY_CF) }));
  const balanceSheet: BalanceSheetAnnual[] = annual.map((r) => ({ date: r.end, symbol, fiscalYear: fy(r), ...(r.data.bs ?? EMPTY_BS) }));
  const incomeQuarterly: IncomeStatementQuarter[] = quarters.map((r) => ({ date: r.end, symbol, ...r.data.inc }));
  const cashFlowQuarterly: CashFlowQuarter[] = quarters.map((r) => ({ date: r.end, symbol, ...(r.data.cf ?? EMPTY_CF) }));
  const balanceSheetQuarterly: BalanceSheetQuarter[] = quarters.map((r) => ({ date: r.end, symbol, ...(r.data.bs ?? EMPTY_BS) }));
  const dividendQuarterly = quarters.map((r) => ({ date: r.end, dividendPerShare: r.data.dps ?? null }));
  const bankAnnual = annual.filter((r) => r.data.bank).map((r) => ({ date: r.end, fiscalYear: fy(r), ...(r.data.bank as BankLines) }));
  const bankQuarterly = quarters.filter((r) => r.data.bank).map((r) => ({ date: r.end, ...(r.data.bank as BankLines) }));
  return {
    name,
    currency,
    income,
    cashFlow,
    balanceSheet,
    incomeQuarterly,
    cashFlowQuarterly,
    balanceSheetQuarterly,
    dividendQuarterly,
    bank: bankAnnual.length || bankQuarterly.length ? { annual: bankAnnual, quarterly: bankQuarterly } : undefined,
  };
}

function overlayOne<T extends { date: string }>(existing: T[], stored: T[], sameYear: boolean): T[] {
  const out = [...existing];
  for (const s of stored) {
    const idx = out.findIndex((e) =>
      sameYear ? d10(e.date).slice(0, 4) === d10(s.date).slice(0, 4) : Math.abs(dayGap(e.date, s.date)) <= MATCH_DAYS,
    );
    if (idx < 0) {
      out.push(s);
      continue;
    }
    // Stored (filed) values win; lines the store does not have keep what the pipeline found.
    const merged = { ...out[idx] } as Record<string, unknown>;
    for (const [k, v] of Object.entries(s) as [string, unknown][]) {
      if (v == null) continue;
      if (v === 0 && ZERO_IS_MISSING.has(k) && merged[k] != null) continue;
      merged[k] = v;
    }
    out[idx] = merged as T;
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Lay the stored periods over a bundle produced by the regular pipeline: every period the
 * store has replaces the pipeline's version; periods the store lacks stay as they were.
 * Used while a company's stored history is still too short to stand on its own.
 */
export function overlayStoreOnBundle(bundle: StockAnalysisBundle, st: StoreStatements): void {
  bundle.income = overlayOne(bundle.income, st.income, true);
  bundle.cashFlow = overlayOne(bundle.cashFlow, st.cashFlow, true);
  bundle.balanceSheet = overlayOne(bundle.balanceSheet, st.balanceSheet, true);
  bundle.incomeQuarterly = overlayOne(bundle.incomeQuarterly, st.incomeQuarterly, false);
  bundle.cashFlowQuarterly = overlayOne(bundle.cashFlowQuarterly, st.cashFlowQuarterly, false);
  bundle.balanceSheetQuarterly = overlayOne(bundle.balanceSheetQuarterly, st.balanceSheetQuarterly, false);
  const stored = new Map(st.dividendQuarterly.filter((p) => p.dividendPerShare != null).map((p) => [d10(p.date), p]));
  bundle.dividendQuarterly = bundle.dividendQuarterly.map((p) => stored.get(d10(p.date)) ?? p);
  if (st.bank) bundle.bank = st.bank;
}

/* ------------------------------------------------------------------ */
/* When to look again                                                   */
/* ------------------------------------------------------------------ */

/**
 * Next time worth asking the sources about this company. Reports arrive a few weeks after
 * the quarter closes, so there is nothing to fetch before that; afterwards look every few
 * days until the new quarter shows up. Keeps the whole universe at about one useful request
 * per company per quarter instead of a daily sweep.
 */
export function nextCheckTime(
  cov: Pick<StoreCoverage, "latestQuarter" | "latestAnnual">,
  opts: { now: number; awaitingConfirmation?: boolean; hasRows: boolean },
): number {
  const { now } = opts;
  if (!opts.hasRows) return now + 30 * DAY_MS;
  // A period known from one source only may be confirmed by the filing within days.
  if (opts.awaitingConfirmation) return now + 5 * DAY_MS;
  const latest = cov.latestQuarter ? Date.parse(cov.latestQuarter) : NaN;
  if (Number.isFinite(latest)) {
    const firstLook = latest + (91 + 21) * DAY_MS;
    if (now < firstLook) return firstLook;
    // Overdue: look every 3 days, then weekly once it is clearly late.
    return now + (now - firstLook > 60 * DAY_MS ? 7 : 3) * DAY_MS;
  }
  const annual = cov.latestAnnual ? Date.parse(cov.latestAnnual) : NaN;
  if (Number.isFinite(annual)) {
    const firstLook = annual + (365 + 45) * DAY_MS;
    return now < firstLook ? firstLook : now + 7 * DAY_MS;
  }
  return now + 30 * DAY_MS;
}
