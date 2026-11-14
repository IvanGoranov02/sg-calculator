import assert from "node:assert/strict";
import test from "node:test";

import { newQuarterCheckDue } from "./service";
import { verifyStatements, type VerifiedStatements } from "./verify";

const QUARTER_ENDS = ["03-31", "06-30", "09-30", "12-31"];

/** 5 fiscal years, 20 quarters, each quarter revenue 100 / net income 10 / OCF 20. */
function statements(): VerifiedStatements {
  const incomeQuarterly = [];
  const cashFlowQuarterly = [];
  const income = [];
  const cashFlow = [];
  const balanceSheet = [];
  for (let y = 2021; y <= 2025; y++) {
    for (const md of QUARTER_ENDS) {
      const date = `${y}-${md}`;
      incomeQuarterly.push({ date, symbol: "T", revenue: 100, grossProfit: 60, operatingExpenses: 40, netIncome: 10 });
      cashFlowQuarterly.push({
        date, symbol: "T", freeCashFlow: 15, operatingCashFlow: 20, capitalExpenditure: -5,
        investingCashFlow: null, financingCashFlow: null, dividendsPaid: null, stockRepurchase: null,
      });
    }
    const fy = String(y);
    income.push({ date: `${y}-12-31`, symbol: "T", fiscalYear: fy, revenue: 400, grossProfit: 240, operatingExpenses: 160, netIncome: 40 });
    cashFlow.push({
      date: `${y}-12-31`, symbol: "T", fiscalYear: fy, freeCashFlow: 60, operatingCashFlow: 80, capitalExpenditure: -20,
      investingCashFlow: null, financingCashFlow: null, dividendsPaid: null, stockRepurchase: null,
    });
    balanceSheet.push({
      date: `${y}-12-31`, symbol: "T", fiscalYear: fy, totalAssets: 1000, totalDebt: null, netDebt: null,
      stockholdersEquity: 500, cashAndCashEquivalents: null, totalCurrentAssets: null, totalCurrentLiabilities: null,
      inventory: null, accountsReceivable: null, goodwill: null, longTermDebt: null,
    });
  }
  return { name: "Test Co", currency: "USD", income, cashFlow, balanceSheet, incomeQuarterly, cashFlowQuarterly, balanceSheetQuarterly: [] };
}

function yahooFor(s: VerifiedStatements, tweak?: (date: string, key: string, v: number) => number) {
  const t = tweak ?? ((_d, _k, v) => v);
  return {
    finA: s.income.slice(-4).map((r) => ({ date: new Date(r.date), totalRevenue: t(r.date, "rev", r.revenue), netIncome: r.netIncome })),
    finQ: s.incomeQuarterly.slice(-5).map((r) => ({ date: new Date(r.date), totalRevenue: t(r.date, "qrev", r.revenue), netIncome: r.netIncome })),
    cfA: s.cashFlow.slice(-4).map((r) => ({ date: new Date(r.date), operatingCashFlow: r.operatingCashFlow ?? undefined })),
    cfQ: [],
    bsA: s.balanceSheet.slice(-4).map((r) => ({ date: new Date(r.date), totalAssets: r.totalAssets ?? undefined })),
    bsQ: [],
  };
}

test("consistent filings that match the second source are verified", () => {
  const s = statements();
  const rep = verifyStatements(s, yahooFor(s));
  assert.equal(rep.ok, true, JSON.stringify(rep.errors));
  assert.ok(rep.crossChecked >= 20);
});

test("a figure that disagrees with the second source blocks verification", () => {
  const s = statements();
  const rep = verifyStatements(s, yahooFor(s, (d, k, v) => (k === "rev" && d.startsWith("2024") ? v * 1.2 : v)));
  assert.equal(rep.ok, false);
  assert.ok(rep.errors.some((e) => e.code === "cross_mismatch" && e.message.includes("FY2024 revenue")));
});

test("the proxy-statement scale bug (net income 1000x too small) is caught", () => {
  const s = statements();
  s.income[4].netIncome = 0.04;
  const rep = verifyStatements(s, yahooFor(statements()));
  assert.equal(rep.ok, false);
  assert.ok(rep.errors.some((e) => e.code === "sum_net_income" || e.code === "cross_mismatch"));
});

test("quarters that do not add up to the annual report are rejected", () => {
  const s = statements();
  s.incomeQuarterly[18].revenue = 160;
  const rep = verifyStatements(s, yahooFor(statements()));
  assert.ok(rep.errors.some((e) => e.code === "sum_revenue"));
});

test("a hole in the quarterly series is rejected", () => {
  const s = statements();
  s.incomeQuarterly.splice(10, 1);
  const rep = verifyStatements(s, yahooFor(s));
  assert.ok(rep.errors.some((e) => e.code === "quarter_gap"));
});

test("no second source means not verified", () => {
  const rep = verifyStatements(statements(), null);
  assert.equal(rep.ok, false);
  assert.ok(rep.errors.some((e) => e.code === "second_source_unavailable"));
});

test("appending a quarter only needs the second source to confirm the new period", () => {
  const s = statements();
  const y = yahooFor(s);
  assert.equal(verifyStatements(s, y, { sinceExclusive: "2025-09-30" }).ok, true);
  y.finQ = y.finQ.filter((r) => r.date.toISOString().slice(0, 10) !== "2025-12-31");
  const rep = verifyStatements(s, y, { sinceExclusive: "2025-09-30" });
  assert.ok(rep.errors.some((e) => e.code === "second_source_thin"));
});

test("new-quarter check waits for the next report window and is throttled", () => {
  const day = 86_400_000;
  const latest = Date.parse("2026-06-30");
  const row = { latestQuarter: "2026-06-30", checkedAt: new Date(latest).toISOString() };
  assert.equal(newQuarterCheckDue(row, latest + 60 * day), false);
  assert.equal(newQuarterCheckDue(row, latest + 110 * day), true);
  const justChecked = { ...row, checkedAt: new Date(latest + 110 * day - 3_600_000).toISOString() };
  assert.equal(newQuarterCheckDue(justChecked, latest + 110 * day), false);
});
