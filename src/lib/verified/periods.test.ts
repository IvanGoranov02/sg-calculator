import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyBankTemplate,
  applyStoreChanges,
  looksLikeBank,
  mergePeriods,
  nextCheckTime,
  overlayStoreOnBundle,
  planStoreChanges,
  rowsToStatements,
  storeCoverage,
  type PeriodRow,
  type SourcePeriod,
} from "./periods";
import type { StockAnalysisBundle } from "../stockAnalysisTypes";

const DAY = 86_400_000;

function period(kind: "A" | "Q", end: string, revenue: number, netIncome: number, extra?: Partial<SourcePeriod["data"]>): SourcePeriod {
  return {
    kind,
    end,
    data: { inc: { revenue, grossProfit: 0, operatingExpenses: 0, netIncome }, ...extra },
  };
}

/** Quarter ends going back from 2026-09-30. */
function quarterEnds(n: number): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(2026, 8, 30));
  for (let i = 0; i < n; i++) {
    out.unshift(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 3 * i + 1, 0)).toISOString().slice(0, 10));
  }
  return out;
}

test("periods both sources agree on are verified; filing-only periods are filed", () => {
  const sec = [period("Q", "2026-06-30", 100, 10), period("Q", "2026-09-30", 110, 12)];
  const yahoo = [period("Q", "2026-09-30", 110.5, 12)];
  const { rows, issues } = mergePeriods("X", sec, yahoo);
  assert.deepEqual(
    rows.map((r) => [r.end, r.trust]),
    [
      ["2026-06-30", "filed"],
      ["2026-09-30", "verified"],
    ],
  );
  assert.equal(issues.length, 0);
});

test("a disagreement keeps the filing and marks the period disputed", () => {
  const { rows, issues } = mergePeriods("X", [period("A", "2025-12-31", 1000, 100)], [period("A", "2025-12-31", 1300, 100)]);
  assert.equal(rows[0].trust, "disputed");
  assert.equal(rows[0].data.inc.revenue, 1000);
  assert.equal(issues[0].code, "cross_mismatch");
});

test("second-source periods the filings lack are stored as single source", () => {
  const { rows } = mergePeriods("X", [period("A", "2025-12-31", 1000, 100)], [period("A", "2025-12-31", 1000, 100), period("Q", "2026-09-30", 300, 30)]);
  const q = rows.find((r) => r.kind === "Q");
  assert.equal(q?.trust, "single");
  assert.equal(q?.source, "yahoo");
});

test("a period a few days apart in the two sources is one period, not two", () => {
  const { rows } = mergePeriods("X", [period("Q", "2026-09-27", 100, 10)], [period("Q", "2026-09-30", 100, 10)]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].end, "2026-09-27");
  assert.equal(rows[0].trust, "verified");
});

test("when filed quarters do not add up to the year, the second source is used for the quarter", () => {
  const sec = [
    period("A", "2025-12-31", 400, 40),
    period("Q", "2025-03-31", 100, 10),
    period("Q", "2025-06-30", 100, 10),
    period("Q", "2025-09-30", 100, 10),
    period("Q", "2025-12-31", 50, 10), // wrong: sums to 350, not 400
  ];
  const { rows } = mergePeriods("X", sec, [period("Q", "2025-12-31", 100, 10)]);
  const q4 = rows.find((r) => r.kind === "Q" && r.end === "2025-12-31");
  assert.equal(q4?.trust, "single");
  assert.equal(q4?.data.inc.revenue, 100);
  assert.equal(rows.find((r) => r.end === "2025-03-31")?.trust, "disputed");
});

test("stored periods are permanent: only new periods and better-confirmed versions are written", () => {
  const row = (end: string, trust: PeriodRow["trust"], revenue: number): PeriodRow => ({
    symbol: "X",
    kind: "Q",
    end,
    trust,
    source: "sec",
    data: { inc: { revenue, grossProfit: 0, operatingExpenses: 0, netIncome: 1 } },
  });
  const existing = [row("2026-03-31", "verified", 100), row("2026-06-30", "single", 200)];
  const fresh = [row("2026-03-31", "verified", 999), row("2026-06-28", "verified", 201), row("2026-09-30", "filed", 300)];
  const plan = planStoreChanges(existing, fresh);
  assert.deepEqual(plan.upserts.map((u) => u.end), ["2026-06-28", "2026-09-30"]);
  assert.deepEqual(plan.deletes, [{ kind: "Q", end: "2026-06-30" }]);
  const after = applyStoreChanges(existing, plan);
  assert.deepEqual(after.map((r) => [r.end, r.data.inc.revenue]), [
    ["2026-03-31", 100],
    ["2026-06-28", 201],
    ["2026-09-30", 300],
  ]);
  // Periods the sources stopped returning stay stored.
  assert.equal(applyStoreChanges(existing, planStoreChanges(existing, [])).length, 2);
  // A forced rebuild replaces what the sources return.
  assert.equal(planStoreChanges(existing, fresh, true).upserts.length, 3);
});

test("coverage: full needs an unbroken run of quarters", () => {
  const mk = (ends: string[], annual: number): PeriodRow[] => [
    ...ends.map((end): PeriodRow => ({ symbol: "X", kind: "Q", end, trust: "filed", source: "sec", data: period("Q", end, 1, 1).data })),
    ...Array.from({ length: annual }, (_, i): PeriodRow => ({ symbol: "X", kind: "A", end: `${2022 + i}-12-31`, trust: "filed", source: "sec", data: period("A", "", 1, 1).data })),
  ];
  const ends = quarterEnds(16);
  assert.equal(storeCoverage(mk(ends, 4)).full, true);
  assert.equal(storeCoverage(mk(ends.slice(-5), 4)).full, false);
  const holed = ends.filter((_, i) => i !== 9);
  const cov = storeCoverage(mk(holed, 4));
  assert.equal(cov.full, false);
  assert.equal(cov.contiguousQuarters, 6);
  assert.equal(cov.latestQuarter, "2026-09-30");
});

test("banks: revenue is net interest income plus non-interest income on both sources", () => {
  const bank = { netInterestIncome: 27, nonInterestIncome: 23, nonInterestExpense: 27, provisionForCreditLosses: 3, deposits: 2700, loans: 1500 };
  const a = period("A", "2025-12-31", 182, 57, { bank, bs: { totalAssets: 4000 } as never });
  const y = period("A", "2025-12-31", 46, 57, { bank: { ...bank }, bs: { totalAssets: 4000 } as never });
  assert.equal(looksLikeBank([a]), true);
  applyBankTemplate([a, y]);
  assert.equal(a.data.inc.revenue, 50);
  const { rows } = mergePeriods("JPM", [a], [y], { bank: true });
  assert.equal(rows[0].trust, "verified");
  const st = rowsToStatements("JPM", "JPM", "USD", rows);
  assert.equal(st.bank?.annual[0].deposits, 2700);
  assert.equal(looksLikeBank([period("A", "2025-12-31", 1, 1, { bank: { ...bank, deposits: 10 }, bs: { totalAssets: 4000 } as never })]), false);
});

test("overlay: stored periods replace the pipeline's, other periods stay", () => {
  const bundle = {
    quote: { symbol: "X", name: "X", price: 1, change: 0, changesPercentage: 0 },
    income: [{ date: "2025-12-31", symbol: "X", fiscalYear: "2025", revenue: 1, grossProfit: 5, operatingExpenses: 0, netIncome: 1 }],
    cashFlow: [],
    balanceSheet: [],
    historical: [],
    investor: {} as StockAnalysisBundle["investor"],
    incomeQuarterly: [
      { date: "2026-03-31", symbol: "X", revenue: 7, grossProfit: 0, operatingExpenses: 0, netIncome: 7 },
      { date: "2026-06-30", symbol: "X", revenue: 8, grossProfit: 3, operatingExpenses: 0, netIncome: 8 },
    ],
    cashFlowQuarterly: [],
    balanceSheetQuarterly: [],
    dividendQuarterly: [],
  } as StockAnalysisBundle;
  const rows = mergePeriods("X", [period("A", "2025-12-31", 1000, 100), period("Q", "2026-06-28", 300, 30), period("Q", "2026-09-30", 310, 31)], []).rows;
  overlayStoreOnBundle(bundle, rowsToStatements("X", "X", "USD", rows));
  assert.equal(bundle.income[0].revenue, 1000);
  assert.equal(bundle.income[0].grossProfit, 5);
  assert.deepEqual(bundle.incomeQuarterly.map((q) => q.revenue), [7, 300, 310]);
  assert.equal(bundle.incomeQuarterly[1].grossProfit, 3);
});

test("next check: nothing before the report can exist, then every few days", () => {
  const now = Date.parse("2026-11-16");
  const cov = { latestQuarter: "2026-09-30", latestAnnual: "2025-12-31" };
  const first = nextCheckTime(cov, { now, hasRows: true });
  assert.equal(new Date(first).toISOString().slice(0, 10), "2027-01-20");
  const late = Date.parse("2027-02-01");
  assert.equal(nextCheckTime(cov, { now: late, hasRows: true }), late + 3 * DAY);
  assert.equal(nextCheckTime(cov, { now, hasRows: true, awaitingConfirmation: true }), now + 5 * DAY);
  assert.equal(nextCheckTime({ latestQuarter: null, latestAnnual: null }, { now, hasRows: false }), now + 30 * DAY);
});
