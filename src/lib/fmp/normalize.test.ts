import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bundleFromFmpStatements,
  detectFmpCurrency,
  type FmpStatements,
} from "@/lib/fmp/normalize";

/** Legacy /api/v3-shaped rows (calendarYear, epsdiluted, netCashUsedForInvestingActivites …). */
function v3Statements(): FmpStatements {
  return {
    incomeAnnual: [
      {
        date: "2024-12-31",
        reportedCurrency: "USD",
        calendarYear: "2024",
        period: "FY",
        revenue: 43_978_000_000,
        grossProfit: 17_000_000_000,
        operatingExpenses: 14_200_000_000,
        operatingIncome: 2_800_000_000,
        ebitda: 5_100_000_000,
        netIncome: 9_856_000_000,
        epsdiluted: 4.56,
        weightedAverageShsOutDil: 2_160_000_000,
      },
      {
        date: "2023-12-31",
        reportedCurrency: "USD",
        calendarYear: "2023",
        period: "FY",
        revenue: 37_281_000_000,
        grossProfit: 14_600_000_000,
        operatingExpenses: 13_500_000_000,
        operatingIncome: 1_110_000_000,
        ebitda: 2_900_000_000,
        netIncome: 1_887_000_000,
        epsdiluted: 0.87,
        weightedAverageShsOutDil: 2_150_000_000,
      },
    ],
    incomeQuarter: [
      {
        date: "2024-12-31",
        period: "Q4",
        revenue: 11_959_000_000,
        grossProfit: 4_700_000_000,
        operatingExpenses: 3_900_000_000,
        netIncome: 6_883_000_000,
        epsdiluted: 3.21,
      },
    ],
    balanceAnnual: [
      {
        date: "2024-12-31",
        totalAssets: 51_244_000_000,
        totalDebt: 11_000_000_000,
        netDebt: 4_000_000_000,
        totalStockholdersEquity: 21_558_000_000,
        cashAndCashEquivalents: 7_000_000_000,
        totalCurrentAssets: 14_000_000_000,
        totalCurrentLiabilities: 11_500_000_000,
        inventory: 0,
        netReceivables: 3_400_000_000,
        goodwill: 8_400_000_000,
        longTermDebt: 9_500_000_000,
      },
    ],
    balanceQuarter: [],
    cashFlowAnnual: [
      {
        date: "2024-12-31",
        operatingCashFlow: 7_137_000_000,
        capitalExpenditure: -242_000_000, // v3 reports outflows negative already
        freeCashFlow: 6_895_000_000,
        netCashUsedForInvestingActivites: -1_700_000_000,
        netCashUsedProvidedByFinancingActivities: -2_100_000_000,
        dividendsPaid: 0,
        commonStockRepurchased: -1_500_000_000,
      },
    ],
    cashFlowQuarter: [],
  };
}

describe("bundleFromFmpStatements (v3 field names)", () => {
  const b = bundleFromFmpStatements("uber", v3Statements());

  it("maps annual income with EPS and diluted shares", () => {
    assert.ok(b);
    assert.equal(b?.quote.symbol, "UBER");
    const fy24 = b?.income.find((r) => r.fiscalYear === "2024");
    assert.equal(fy24?.revenue, 43_978_000_000);
    assert.equal(fy24?.netIncome, 9_856_000_000);
    assert.equal(fy24?.dilutedEps, 4.56);
    assert.equal(fy24?.dilutedAverageShares, 2_160_000_000);
  });

  it("keeps the negative-outflow convention for capex and buybacks", () => {
    const cf = b?.cashFlow.find((r) => r.fiscalYear === "2024");
    assert.equal(cf?.capitalExpenditure, -242_000_000);
    assert.equal(cf?.stockRepurchase, -1_500_000_000);
    assert.equal(cf?.freeCashFlow, 6_895_000_000);
  });

  it("maps balance-sheet debt and receivables directly (no derivation needed)", () => {
    const bs = b?.balanceSheet.find((r) => r.fiscalYear === "2024");
    assert.equal(bs?.totalDebt, 11_000_000_000);
    assert.equal(bs?.netDebt, 4_000_000_000);
    assert.equal(bs?.accountsReceivable, 3_400_000_000);
  });

  it("maps quarterly income rows", () => {
    assert.equal(b?.incomeQuarterly.length, 1);
    assert.equal(b?.incomeQuarterly[0].netIncome, 6_883_000_000);
    assert.equal(b?.dividendQuarterly.length, 1);
  });

  it("detects the reported currency", () => {
    assert.equal(detectFmpCurrency(v3Statements()), "USD");
  });
});

describe("bundleFromFmpStatements (stable field names)", () => {
  it("reads epsDiluted / netCashProvidedByInvestingActivities variants", () => {
    const st = v3Statements();
    st.incomeAnnual = (st.incomeAnnual as Record<string, unknown>[]).map((r) => {
      const { epsdiluted, ...rest } = r;
      return { ...rest, epsDiluted: epsdiluted, fiscalYear: r.calendarYear };
    });
    st.cashFlowAnnual = [
      {
        date: "2024-12-31",
        netCashProvidedByOperatingActivities: 7_137_000_000,
        capitalExpenditure: 242_000_000, // positive variant — must be normalized negative
        netCashProvidedByInvestingActivities: -1_700_000_000,
        netCashProvidedByFinancingActivities: -2_100_000_000,
        netDividendsPaid: 100_000_000,
      },
    ];
    const b = bundleFromFmpStatements("UBER", st)!;
    assert.equal(b.income.find((r) => r.fiscalYear === "2024")?.dilutedEps, 4.56);
    const cf = b.cashFlow[0];
    assert.equal(cf.operatingCashFlow, 7_137_000_000);
    assert.equal(cf.capitalExpenditure, -242_000_000);
    assert.equal(cf.dividendsPaid, -100_000_000);
    // FCF derived when not given: OCF + (negative) capex
    assert.equal(cf.freeCashFlow, 6_895_000_000);
  });
});

describe("bundleFromFmpStatements guards", () => {
  it("accepts a single filed annual (recent IPOs)", () => {
    const st = v3Statements();
    st.incomeAnnual = st.incomeAnnual.slice(0, 1);
    const b = bundleFromFmpStatements("UBER", st);
    assert.ok(b);
    assert.equal(b?.income.length, 1);
  });

  it("returns null for empty statements", () => {
    assert.equal(
      bundleFromFmpStatements("X", {
        incomeAnnual: [],
        incomeQuarter: [],
        balanceAnnual: [],
        balanceQuarter: [],
        cashFlowAnnual: [],
        cashFlowQuarter: [],
      }),
      null,
    );
  });
});
