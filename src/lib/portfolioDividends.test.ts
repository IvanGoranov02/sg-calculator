import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildFilledMonthlyAmounts,
  buildHoldingMonthlyTimeline,
  buildMonthlyChartSeries,
  buildMonthlyIncome,
  buildPortfolioDividendsPayload,
  calendarMonthsBetween,
  growthPillsFromCachePayload,
  incomeGrowthPillsFromMonthly,
  paymentMatchesSymbol,
  rollingTtmMonthly,
  type PortfolioDividendPayment,
} from "@/lib/portfolioDividends";

describe("calendarMonthsBetween", () => {
  it("fills every month inclusively", () => {
    assert.deepEqual(calendarMonthsBetween("2024-01", "2024-03"), ["2024-01", "2024-02", "2024-03"]);
  });
});

describe("buildFilledMonthlyAmounts", () => {
  it("zero-fills quiet calendar months", () => {
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
      {
        id: "2",
        source: "manual",
        ticker: "A",
        symbolYahoo: "A",
        amount: 20,
        currency: "USD",
        paidOn: "2024-03-15",
      },
    ]);
    const filled = buildFilledMonthlyAmounts(monthly, "USD");
    assert.deepEqual(filled, [10, 0, 20]);
  });
});

describe("rollingTtmMonthly", () => {
  it("sums trailing 12 calendar months including zeros", () => {
    const ttm = rollingTtmMonthly([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2]);
    assert.equal(ttm[11], 3);
  });
});

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

describe("buildMonthlyChartSeries", () => {
  it("returns null income when FX conversion is unavailable for foreign currency", () => {
    const monthly = buildMonthlyIncome([
      {
        id: "1",
        source: "manual",
        ticker: "VOW3",
        symbolYahoo: "VOW3.DE",
        amount: 20,
        currency: "EUR",
        paidOn: "2024-04-01",
      },
    ]);
    const chart = buildMonthlyChartSeries(monthly, "USD", { eurPerUsd: null, gbpPerUsd: null });
    assert.equal(chart[0]!.income, null);
  });

  it("converts foreign currency with FX rates", () => {
    const monthly = buildMonthlyIncome([
      {
        id: "1",
        source: "manual",
        ticker: "VOW3",
        symbolYahoo: "VOW3.DE",
        amount: 10,
        currency: "EUR",
        paidOn: "2024-04-01",
      },
    ]);
    const chart = buildMonthlyChartSeries(monthly, "USD", { eurPerUsd: 0.5, gbpPerUsd: null });
    assert.equal(chart[0]!.income, 20);
  });
});

describe("incomeGrowthPillsFromMonthly", () => {
  it("returns null when fewer than 24 calendar months", () => {
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
    assert.ok(Array.isArray(payload.chartSeries));
  });

  it("uses all holdings in portfolio yield denominator", () => {
    const payload = buildPortfolioDividendsPayload({
      holdings: [
        {
          symbolYahoo: "AAPL",
          symbolT212: null,
          quantity: 10 as unknown as import("@prisma/client").PortfolioHolding["quantity"],
          avgPrice: 100 as unknown as import("@prisma/client").PortfolioHolding["avgPrice"],
          currency: "USD",
        },
        {
          symbolYahoo: "MSFT",
          symbolT212: null,
          quantity: 10 as unknown as import("@prisma/client").PortfolioHolding["quantity"],
          avgPrice: 100 as unknown as import("@prisma/client").PortfolioHolding["avgPrice"],
          currency: "USD",
        },
      ],
      quotes: {
        AAPL: {
          symbol: "AAPL",
          name: "Apple",
          price: 100,
          currency: "USD",
          dividendYield: 0.05,
          dividendRate: 5,
          changePercent: 0,
          twoHundredDayAverage: null,
          dipVsSma200Pct: null,
          nextEarnings: null,
          sector: null,
        },
        MSFT: {
          symbol: "MSFT",
          name: "Microsoft",
          price: 100,
          currency: "USD",
          dividendYield: 0,
          dividendRate: 0,
          changePercent: 0,
          twoHundredDayAverage: null,
          dipVsSma200Pct: null,
          nextEarnings: null,
          sector: null,
        },
      },
      fx: { eurPerUsd: null, gbpPerUsd: null },
      t212Items: [],
      manualRows: [],
      cacheBySymbol: {},
      trading212: { connected: false },
    });

    assert.equal(payload.positions.length, 1);
    assert.ok(Math.abs((payload.summary.portfolioYieldOnValue ?? 0) - 2.5) < 1e-6);
  });
});

describe("growthPillsFromCachePayload", () => {
  it("returns null for empty cache payload", () => {
    assert.equal(growthPillsFromCachePayload(null), null);
    assert.equal(growthPillsFromCachePayload({}), null);
  });
});

describe("paymentMatchesSymbol", () => {
  it("matches symbolYahoo or ticker", () => {
    const p: PortfolioDividendPayment = {
      id: "1",
      source: "manual",
      ticker: "AAPL_US_EQ",
      symbolYahoo: "AAPL",
      amount: 1,
      currency: "USD",
      paidOn: "2024-01-01",
    };
    assert.equal(paymentMatchesSymbol(p, "AAPL"), true);
    assert.equal(paymentMatchesSymbol(p, "AAPL_US_EQ"), true);
    assert.equal(paymentMatchesSymbol(p, "MSFT"), false);
  });
});

describe("buildHoldingMonthlyTimeline", () => {
  it("fills quiet calendar months with null amounts", () => {
    const payments: PortfolioDividendPayment[] = [
      {
        id: "1",
        source: "manual",
        ticker: "AAPL",
        symbolYahoo: "AAPL",
        amount: 10,
        currency: "USD",
        paidOn: "2024-01-15",
      },
      {
        id: "2",
        source: "t212",
        ticker: "AAPL",
        symbolYahoo: "AAPL",
        amount: 20,
        currency: "USD",
        paidOn: "2024-03-20",
      },
    ];
    const timeline = buildHoldingMonthlyTimeline(payments, "AAPL");
    assert.deepEqual(
      timeline.map((r) => ({ month: r.month, amount: r.amount })),
      [
        { month: "2024-01", amount: 10 },
        { month: "2024-02", amount: null },
        { month: "2024-03", amount: 20 },
      ],
    );
  });

  it("normalizes datetime paidOn from T212", () => {
    const payload = buildPortfolioDividendsPayload({
      holdings: [],
      quotes: {},
      fx: { eurPerUsd: null, gbpPerUsd: null },
      t212Items: [
        {
          ticker: "MSFT",
          amount: 5,
          currency: "USD",
          paidOn: "2024-06-15T00:00:00.000Z",
        },
      ],
      manualRows: [],
      cacheBySymbol: {},
      trading212: { connected: true },
    });
    assert.equal(payload.payments[0]?.paidOn, "2024-06-15");
  });
});
