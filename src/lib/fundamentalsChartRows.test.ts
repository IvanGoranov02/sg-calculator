import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildQuarterlyChartRows,
  disambiguateQuarterlyChartLabels,
} from "@/lib/fundamentalsChartRows";
import type { IncomeStatementQuarter, StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

const formatMonthYear = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });

function incomeRow(date: string, revenue: number): IncomeStatementQuarter {
  return {
    date,
    symbol: "NVDA",
    revenue,
    grossProfit: revenue * 0.7,
    operatingExpenses: revenue * 0.2,
    netIncome: revenue * 0.4,
    dilutedEps: revenue / 1e10,
  };
}

describe("disambiguateQuarterlyChartLabels", () => {
  it("adds day when month+year labels collide within the same month", () => {
    const labels = disambiguateQuarterlyChartLabels(
      ["2026-04-20", "2026-04-26"],
      formatMonthYear,
      "en-US",
    );
    assert.equal(labels[0], "Apr 20, 26");
    assert.equal(labels[1], "Apr 26, 26");
    assert.notEqual(labels[0], labels[1]);
  });
});

describe("buildQuarterlyChartRows", () => {
  it("collapses Apr-20 + Apr-26 NVDA-style rows and keeps side metrics", () => {
    const bundle = {
      quote: { symbol: "NVDA", name: "NVIDIA", price: 100, change: 0, changesPercentage: 0 },
      investor: { currency: "USD" } as StockAnalysisBundle["investor"],
      historical: [],
      income: [],
      cashFlow: [],
      balanceSheet: [],
      incomeQuarterly: [
        incomeRow("2026-01-26", 39_000_000_000),
        incomeRow("2026-04-20", 32_500_000_000),
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
        },
      ],
      dividendQuarterly: [],
    } as StockAnalysisBundle;

    const rows = buildQuarterlyChartRows(bundle, formatMonthYear, "en-US");
    assert.equal(rows.length, 2);
    const aprRows = rows.filter((r) => String(r.periodEnd).startsWith("2026-04"));
    assert.equal(aprRows.length, 1);
    const last = aprRows[0]!;
    assert.equal(last.periodEnd, "2026-04-26");
    assert.equal(last.revenue, 81_600_000_000);
    assert.equal(last.ocf, 5_000_000_000);
    assert.equal(last.totalAssets, 100_000_000_000);
  });
});
