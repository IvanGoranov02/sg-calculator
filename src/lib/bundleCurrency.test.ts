import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyDividendFx,
  convertBundleFundamentals,
  dividendFxPlan,
  dividendsAlreadyInQuoteCurrency,
  dropStaleOpenWindowSum,
  overlayQuarterlyDividends,
} from "@/lib/bundleCurrency";
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

  it("can leave dividends unscaled when they are already quote currency", () => {
    const b = convertBundleFundamentals(makeBundle(), 1.1, { convertDividends: false });
    assert.ok(Math.abs(b.income[0].revenue - 110) < 1e-9);
    assert.equal(b.dividendQuarterly[0].dividendPerShare, 1.2);
  });
});

describe("dividendsAlreadyInQuoteCurrency", () => {
  const quarters = (dps: number) =>
    [0, 1, 2, 3].map(() => ({ dividendPerShare: dps }));

  it("treats FB2A.DE listing cash as EUR and does not ask for a second scale", () => {
    // Yahoo ex-div on FB2A.DE is the USD dividend converted once (~€0.461 = $0.525).
    // Scaling again by ~0.867 produced the reported ~$0.3996 figure.
    const eurCash = 0.461;
    const usdPerShare = 0.525;
    const eurPerUsd = 0.8667;
    assert.ok(Math.abs(eurCash * eurPerUsd - 0.3996) < 0.001);
    assert.equal(dividendsAlreadyInQuoteCurrency(quarters(eurCash), 1.83, eurPerUsd), true);
    assert.equal(dividendsAlreadyInQuoteCurrency(quarters(usdPerShare), 1.83, eurPerUsd), false);
  });

  it("does not rescale a series that already matches the quote-currency annual rate", () => {
    // META: $0.525 × 4 = $2.10. Same currency, so an FX rate must not be applied.
    assert.equal(dividendsAlreadyInQuoteCurrency(quarters(0.525), 2.1, 0.88), true);
  });

  it("returns false without an annual rate to compare", () => {
    assert.equal(dividendsAlreadyInQuoteCurrency(quarters(0.461), null, 0.88), false);
  });
});

describe("overlayQuarterlyDividends", () => {
  const rows = [
    { date: "2025-12-31", dividendPerShare: 0.525 },
    { date: "2026-03-31", dividendPerShare: null },
  ];
  const events = [
    { date: "2025-12-15", amount: 0.461 },
    { date: "2026-03-16", amount: 0.461 },
  ];

  it("fills only gaps by default", () => {
    const applied = overlayQuarterlyDividends(rows, events, "fill-gaps");
    assert.equal(applied.rows[0]!.dividendPerShare, 0.525);
    assert.equal(applied.rows[1]!.dividendPerShare, 0.461);
    assert.equal(applied.kept, 1);
  });

  it("overwrites reporting-currency DPS with listing cash", () => {
    const applied = overlayQuarterlyDividends(rows, events, "overwrite");
    assert.equal(applied.rows[0]!.dividendPerShare, 0.461);
    assert.equal(applied.rows[1]!.dividendPerShare, 0.461);
    assert.equal(applied.wrote, 2);
    assert.equal(applied.kept, 0);
    assert.deepEqual(applied.listingDates, ["2025-12-31", "2026-03-31"]);
  });

  it("does not dump dividends older than the quarterly series into the first bar", () => {
    // ASML NASDAQ: 5 years of quarters, 12 years of ex-div. An open window
    // from 1900-01-01 summed nine payouts back to 2015 into 2021-09-30 (~$13.261).
    const rows = [
      { date: "2021-09-30", dividendPerShare: 2.08 },
      { date: "2021-12-31", dividendPerShare: 1.5 },
      { date: "2022-03-31", dividendPerShare: 1.6 },
      { date: "2022-06-30", dividendPerShare: 1.7 },
    ];
    const events = [
      { date: "2015-04-24", amount: 0.7 },
      { date: "2016-04-25", amount: 0.9 },
      { date: "2017-04-24", amount: 1.1 },
      { date: "2018-04-25", amount: 1.3 },
      { date: "2019-04-29", amount: 1.5 },
      { date: "2020-04-29", amount: 1.7 },
      { date: "2020-11-04", amount: 1.9 },
      { date: "2021-05-03", amount: 1.87 },
      { date: "2021-08-04", amount: 2.084 },
      { date: "2021-11-03", amount: 2.1 },
    ];
    const applied = overlayQuarterlyDividends(rows, events, "overwrite");
    assert.equal(applied.rows[0]!.dividendPerShare, 2.084);
    assert.equal(applied.rows[1]!.dividendPerShare, 2.1);
    assert.equal(applied.rows[2]!.dividendPerShare, 1.6);
    assert.equal(applied.rows[3]!.dividendPerShare, 1.7);
    assert.deepEqual(applied.listingDates, ["2021-09-30", "2021-12-31"]);
    assert.ok((applied.rows[0]!.dividendPerShare ?? 0) < 3);
  });

  it("keeps fundamentals DPS when the clamped first window has no ex-div", () => {
    const rows = [
      { date: "2021-09-30", dividendPerShare: 2.08 },
      { date: "2021-12-31", dividendPerShare: 1.5 },
    ];
    const events = [
      { date: "2015-04-24", amount: 11.177 },
      { date: "2021-05-03", amount: 1.87 },
      { date: "2021-11-02", amount: 2.084 },
    ];
    const applied = overlayQuarterlyDividends(rows, events, "overwrite");
    assert.equal(applied.rows[0]!.dividendPerShare, 2.08);
    assert.equal(applied.rows[1]!.dividendPerShare, 2.084);
    assert.deepEqual(applied.listingDates, ["2021-12-31"]);
  });
});

describe("dropStaleOpenWindowSum", () => {
  it("nulls a first bar a previous pass stored as listing cash when this window did not rewrite it", () => {
    const rows = [
      { date: "2021-09-30", dividendPerShare: 13.261 },
      { date: "2021-12-31", dividendPerShare: 2.084 },
    ];
    const repaired = dropStaleOpenWindowSum(rows, ["2021-12-31"], ["2021-09-30", "2021-12-31"]);
    assert.equal(repaired.rows[0]!.dividendPerShare, null);
    assert.equal(repaired.rows[1]!.dividendPerShare, 2.084);
    assert.deepEqual([...repaired.listingDates].sort(), ["2021-12-31"]);
  });

  it("keeps a fundamentals DPS that was never overwritten with listing cash", () => {
    const rows = [
      { date: "2021-09-30", dividendPerShare: 2.08 },
      { date: "2021-12-31", dividendPerShare: 2.084 },
    ];
    const repaired = dropStaleOpenWindowSum(rows, ["2021-12-31"], []);
    assert.equal(repaired.rows[0]!.dividendPerShare, 2.08);
    assert.deepEqual(repaired.listingDates, []);
  });
});

describe("partial dividend FX", () => {
  it("scales only the reporting-currency row when a quarter has no ex-date", () => {
    // ASML 2022-03-31 has no ex-div. That EUR DPS must convert; USD rows must not.
    const rows = [
      { date: "2021-12-31", dividendPerShare: 2.084 },
      { date: "2022-03-31", dividendPerShare: 1.7 },
      { date: "2022-06-30", dividendPerShare: 2.1 },
    ];
    const events = [
      { date: "2021-11-02", amount: 2.084 },
      { date: "2022-05-03", amount: 2.1 },
    ];
    const applied = overlayQuarterlyDividends(rows, events, "overwrite");
    assert.equal(applied.rows[1]!.dividendPerShare, 1.7);
    assert.deepEqual(applied.listingDates, ["2021-12-31", "2022-06-30"]);

    const plan = dividendFxPlan({
      listingDates: applied.listingDates,
      quoteCurrency: "USD",
      points: applied.rows,
      quoteAnnualDividend: null,
      quotePerFinancial: 1.14,
    });
    assert.equal(plan, "unmarked");

    const scaled = applyDividendFx(applied.rows, new Set(applied.listingDates), 1.14);
    assert.equal(scaled[0]!.dividendPerShare, 2.084);
    assert.ok(Math.abs((scaled[1]!.dividendPerShare ?? 0) - 1.7 * 1.14) < 1e-9);
    assert.equal(scaled[2]!.dividendPerShare, 2.1);
  });

  it("does not skip FX on a leftover reporting row when the latest listing payment matches dividendRate", () => {
    // The gap sits in the middle. The latest USD payments match dividendRate, so the
    // series-level heuristic would skip FX and leave the EUR row labeled as dollars.
    const points = [
      { date: "2022-03-31", dividendPerShare: 1.7 },
      { date: "2022-06-30", dividendPerShare: 2.084 },
      { date: "2022-09-30", dividendPerShare: 2.084 },
      { date: "2022-12-31", dividendPerShare: 2.084 },
    ];
    assert.equal(dividendsAlreadyInQuoteCurrency(points, 8.336, 1.14), true);
    assert.equal(
      dividendFxPlan({
        listingDates: ["2022-06-30", "2022-09-30", "2022-12-31"],
        stampedQuoteCurrency: "USD",
        quoteCurrency: "USD",
        points,
        quoteAnnualDividend: 8.336,
        quotePerFinancial: 1.14,
      }),
      "unmarked",
    );
    const scaled = applyDividendFx(
      points,
      new Set(["2022-06-30", "2022-09-30", "2022-12-31"]),
      1.14,
    );
    assert.ok(Math.abs((scaled[0]!.dividendPerShare ?? 0) - 1.7 * 1.14) < 1e-9);
    assert.equal(scaled[3]!.dividendPerShare, 2.084);
  });

  it("still skips a second scale for a listing series that has no per-row dates", () => {
    // Legacy FB2A.DE cache: every row is already EUR cash matching dividendRate.
    assert.equal(
      dividendFxPlan({
        listingDates: [],
        quoteCurrency: "EUR",
        points: [0, 1, 2, 3].map(() => ({ dividendPerShare: 0.461 })),
        quoteAnnualDividend: 1.83,
        quotePerFinancial: 0.8667,
      }),
      "none",
    );
  });
});
