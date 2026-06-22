import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { convertBundleFundamentals } from "@/lib/bundleCurrency";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

function makeBundle(): StockAnalysisBundle {
  return {
    quote: { symbol: "ASML", name: "ASML", price: 1000, change: 0, changesPercentage: 0 },
    income: [
      {
        date: "2024-12-31",
        symbol: "ASML",
        fiscalYear: "2024",
        revenue: 100,
        grossProfit: 50,
        operatingExpenses: 20,
        netIncome: 30,
        operatingIncome: 28,
        ebitda: 35,
        dilutedEps: 7.5,
        dilutedAverageShares: 4, // a count — must NOT scale
      },
    ],
    cashFlow: [
      {
        date: "2024-12-31",
        symbol: "ASML",
        fiscalYear: "2024",
        freeCashFlow: 25,
        operatingCashFlow: 40,
        capitalExpenditure: -15,
        investingCashFlow: null,
        financingCashFlow: null,
        dividendsPaid: -5,
        stockRepurchase: null,
      },
    ],
    balanceSheet: [
      {
        date: "2024-12-31",
        symbol: "ASML",
        fiscalYear: "2024",
        totalAssets: 200,
        totalDebt: 40,
        netDebt: 10,
        stockholdersEquity: 120,
        cashAndCashEquivalents: 30,
        totalCurrentAssets: null,
        totalCurrentLiabilities: null,
        inventory: 18,
        accountsReceivable: null,
        goodwill: null,
        longTermDebt: 35,
      },
    ],
    historical: [],
    investor: { currency: "EUR" } as StockAnalysisBundle["investor"],
    incomeQuarterly: [],
    cashFlowQuarterly: [],
    balanceSheetQuarterly: [],
    dividendQuarterly: [{ date: "2024-12-31", dividendPerShare: 1.2 }],
  };
}

describe("convertBundleFundamentals", () => {
  it("scales monetary fields and per-share, but not share counts", () => {
    const b = convertBundleFundamentals(makeBundle(), 1.1);
    const inc = b.income[0];
    assert.ok(Math.abs(inc.revenue - 110) < 1e-9);
    assert.ok(Math.abs(inc.netIncome - 33) < 1e-9);
    assert.ok(Math.abs((inc.dilutedEps as number) - 8.25) < 1e-9);
    assert.equal(inc.dilutedAverageShares, 4); // unchanged
    assert.ok(Math.abs(b.cashFlow[0].freeCashFlow - 27.5) < 1e-9);
    assert.ok(Math.abs((b.cashFlow[0].capitalExpenditure as number) + 16.5) < 1e-9);
    assert.ok(Math.abs((b.balanceSheet[0].netDebt as number) - 11) < 1e-9);
    assert.ok(Math.abs((b.dividendQuarterly[0].dividendPerShare as number) - 1.32) < 1e-9);
  });

  it("preserves nulls", () => {
    const b = convertBundleFundamentals(makeBundle(), 1.1);
    assert.equal(b.cashFlow[0].investingCashFlow, null);
    assert.equal(b.balanceSheet[0].accountsReceivable, null);
  });

  it("is a no-op for rate 1 or invalid rate", () => {
    const b1 = convertBundleFundamentals(makeBundle(), 1);
    assert.equal(b1.income[0].revenue, 100);
    const b2 = convertBundleFundamentals(makeBundle(), 0);
    assert.equal(b2.income[0].revenue, 100);
    const b3 = convertBundleFundamentals(makeBundle(), NaN);
    assert.equal(b3.income[0].revenue, 100);
  });
});
