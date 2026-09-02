import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildQuarterlyChartRows } from "@/lib/fundamentalsChartRows";
import { trimBundleToFundamentalsWindow } from "@/lib/fundamentalsHistoryLimits";
import {
  alignQuarterlyToIncome,
  dedupeQuarterlyIncome,
  mergeIncomeStatementQuarters,
  NEAREST_QUARTER_SIDE_ROW_DAYS,
} from "@/lib/quarterlyAlign";
import type { BalanceSheetQuarter, CashFlowQuarter, IncomeStatementQuarter, StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

function incomeRow(date: string, revenue: number): IncomeStatementQuarter {
  return {
    date,
    symbol: "NVDA",
    revenue,
    grossProfit: revenue * 0.7,
    operatingExpenses: revenue * 0.2,
    netIncome: revenue * 0.4,
  };
}

function formatPeriodApr26(dateIso: string): string {
  const d = new Date(`${dateIso.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

describe("dedupeQuarterlyIncome", () => {
  it("merges rows within the nearest-quarter window (duplicate fiscal quarter)", () => {
    const rows = dedupeQuarterlyIncome([
      incomeRow("2026-01-26", 39_000_000_000),
      incomeRow("2026-04-20", 81_600_000_000),
      incomeRow("2026-04-26", 81_600_000_000),
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[1]!.date, "2026-04-26");
    assert.equal(rows[1]!.revenue, 81_600_000_000);
  });

  it("keeps distinct quarters when period ends are far apart", () => {
    const rows = dedupeQuarterlyIncome([
      incomeRow("2025-10-26", 35_000_000_000),
      incomeRow("2026-01-26", 39_000_000_000),
      incomeRow("2026-04-26", 81_600_000_000),
    ]);
    assert.equal(rows.length, 3);
  });

  it("does not merge quarters more than maxDays apart", () => {
    const a = incomeRow("2026-01-01", 10);
    const b = incomeRow("2026-03-20", 20);
    const days = 79;
    assert.ok(days > NEAREST_QUARTER_SIDE_ROW_DAYS);
    const rows = dedupeQuarterlyIncome([a, b]);
    assert.equal(rows.length, 2);
  });
});

describe("mergeIncomeStatementQuarters", () => {
  it("keeps the later period end and prefers non-zero metrics", () => {
    const merged = mergeIncomeStatementQuarters(
      incomeRow("2026-04-20", 81_600_000_000),
      incomeRow("2026-04-26", 81_600_000_000),
    );
    assert.equal(merged.date, "2026-04-26");
    assert.equal(merged.revenue, 81_600_000_000);
  });
});

describe("alignQuarterlyToIncome", () => {
  it("stamps matched side rows with the income period-end date", () => {
    const income = dedupeQuarterlyIncome([
      incomeRow("2026-01-26", 39_000_000_000),
      incomeRow("2026-04-20", 81_600_000_000),
      incomeRow("2026-04-26", 81_600_000_000),
    ]);
    const aligned = alignQuarterlyToIncome(
      "NVDA",
      income,
      [
        {
          date: "2026-04-20",
          symbol: "NVDA",
          freeCashFlow: 4_000_000_000,
          operatingCashFlow: 5_000_000_000,
          capitalExpenditure: null,
          investingCashFlow: null,
          financingCashFlow: null,
          dividendsPaid: null,
          stockRepurchase: null,
        },
      ],
      [
        {
          date: "2026-04-20",
          symbol: "NVDA",
          totalAssets: 100_000_000_000,
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
        } satisfies BalanceSheetQuarter,
      ],
      [{ date: "2026-04-20", dividendPerShare: 0.04 }],
    );
    assert.equal(aligned.cashFlowQuarterly.length, 2);
    const aprCf = aligned.cashFlowQuarterly[1]!;
    assert.equal(aprCf.date, "2026-04-26");
    assert.equal(aprCf.operatingCashFlow, 5_000_000_000);
    assert.equal(aligned.balanceSheetQuarterly[1]!.date, "2026-04-26");
    assert.equal(aligned.balanceSheetQuarterly[1]!.totalAssets, 100_000_000_000);
    assert.equal(aligned.dividendQuarterly[1]!.date, "2026-04-26");
    assert.equal(aligned.dividendQuarterly[1]!.dividendPerShare, 0.04);
  });
});

describe("quarterly chart rows", () => {
  it("shows one bar per fiscal quarter when labels would match", () => {
    const bundle = {
      quote: { symbol: "NVDA", name: "NVIDIA", price: 100, change: 0, changesPercentage: 0 },
      investor: { currency: "USD" } as StockAnalysisBundle["investor"],
      historical: [],
      income: [],
      cashFlow: [],
      balanceSheet: [],
      incomeQuarterly: [
        incomeRow("2026-01-26", 39_000_000_000),
        incomeRow("2026-04-20", 81_600_000_000),
        incomeRow("2026-04-26", 81_600_000_000),
      ],
      cashFlowQuarterly: [
        {
          date: "2026-04-20",
          symbol: "NVDA",
          freeCashFlow: 4_000_000_000,
          operatingCashFlow: 5_000_000_000,
          capitalExpenditure: null,
          investingCashFlow: null,
          financingCashFlow: null,
          dividendsPaid: null,
          stockRepurchase: null,
        },
      ],
      balanceSheetQuarterly: [
        {
          date: "2026-04-20",
          symbol: "NVDA",
          totalAssets: 100_000_000_000,
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
        } satisfies BalanceSheetQuarter,
      ],
      dividendQuarterly: [{ date: "2026-04-20", dividendPerShare: 0.04 }],
    } as StockAnalysisBundle;

    trimBundleToFundamentalsWindow(bundle);
    const chartRows = buildQuarterlyChartRows(bundle, formatPeriodApr26);
    const apr26Rows = chartRows.filter((r) => r.label === "Apr 26");
    assert.equal(apr26Rows.length, 1);
    assert.equal(apr26Rows[0]?.revenue, 81_600_000_000);
    assert.equal(apr26Rows[0]?.ocf, 5_000_000_000);
    assert.equal(apr26Rows[0]?.fcf, 4_000_000_000);
    assert.equal(apr26Rows[0]?.totalAssets, 100_000_000_000);
    assert.equal(bundle.dividendQuarterly[1]?.date, "2026-04-26");
    assert.equal(bundle.dividendQuarterly[1]?.dividendPerShare, 0.04);
    assert.equal(chartRows[chartRows.length - 1]?.revenue, 81_600_000_000);
    const lastTwo = chartRows.slice(-2);
    if (lastTwo.length === 2) {
      assert.notEqual(lastTwo[0]?.revenue, lastTwo[1]?.revenue);
    }
  });
});
