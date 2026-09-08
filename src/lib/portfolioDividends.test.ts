import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMonthlyIncome,
  buildPortfolioDividendsPayload,
  growthPillsFromCachePayload,
  incomeGrowthPillsFromMonthly,
  type PortfolioDividendPayment,
} from "@/lib/portfolioDividends";

describe("buildMonthlyIncome", () => {
  it("groups payments by month and currency", () => {
    const payments: PortfolioDividendPayment[] = [
      {
        id: "1",
        source: "manual",
        ticker: "AAPL",
        symbolYahoo: "AAPL",
        amount: 10,
        currency: "USD",
        paidOn: "2024-03-15",
      },
      {
        id: "2",
        source: "t212",
        ticker: "MSFT",
        symbolYahoo: "MSFT",
        amount: 5,
        currency: "USD",
        paidOn: "2024-03-20",
      },
      {
        id: "3",
        source: "manual",
        ticker: "VOW3",
        symbolYahoo: "VOW3.DE",
        amount: 20,
        currency: "EUR",
        paidOn: "2024-04-01",
      },
    ];
    const monthly = buildMonthlyIncome(payments);
    assert.equal(monthly.length, 2);
    assert.equal(monthly[0]!.month, "2024-03");
    assert.deepEqual(monthly[0]!.totals, [{ currency: "USD", amount: 15 }]);
    assert.equal(monthly[1]!.month, "2024-04");
    assert.deepEqual(monthly[1]!.totals, [{ currency: "EUR", amount: 20 }]);
  });
});

describe("incomeGrowthPillsFromMonthly", () => {
  it("returns null when fewer than 13 months of data", () => {
    const monthly = buildMonthlyIncome([
      {
        id: "1",
        source: "manual",
        ticker: "A",
        symbolYahoo: "A",
        amount: 10,
        currency: "USD",
        paidOn: "2024-01-15",
      },
    ]);
    assert.equal(incomeGrowthPillsFromMonthly(monthly, "USD"), null);
  });
});

describe("buildPortfolioDividendsPayload", () => {
  it("includes dividend payers with yield on cost", () => {
    const payload = buildPortfolioDividendsPayload({
      holdings: [
        {
          symbolYahoo: "AAPL",
          symbolT212: "AAPL_US_EQ",
          quantity: 10 as unknown as import("@prisma/client").PortfolioHolding["quantity"],
          avgPrice: 100 as unknown as import("@prisma/client").PortfolioHolding["avgPrice"],
          currency: "USD",
        },
      ],
      quotes: {
        AAPL: {
          symbol: "AAPL",
          name: "Apple Inc.",
          price: 150,
          currency: "USD",
          dividendYield: 0.005,
          dividendRate: 1,
          changePercent: 0,
          twoHundredDayAverage: null,
          dipVsSma200Pct: null,
          nextEarnings: null,
          sector: "Technology",
        },
      },
      fx: { eurPerUsd: null, gbpPerUsd: null },
      t212Items: [],
      manualRows: [],
      cacheBySymbol: {},
      trading212: { connected: false },
    });

    assert.equal(payload.positions.length, 1);
    assert.equal(payload.positions[0]!.symbol, "AAPL");
    assert.equal(payload.positions[0]!.yieldOnCost, 1);
    assert.ok(Math.abs((payload.summary.portfolioYieldOnValue ?? 0) - 10 / 15) < 1e-6);
  });
});

describe("growthPillsFromCachePayload", () => {
  it("returns null for empty cache payload", () => {
    assert.equal(growthPillsFromCachePayload(null), null);
    assert.equal(growthPillsFromCachePayload({}), null);
  });
});
