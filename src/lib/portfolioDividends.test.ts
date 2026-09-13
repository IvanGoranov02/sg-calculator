import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildFilledMonthlyAmounts,
  buildFilledMonthlyAmountsInCurrency,
  buildHoldingMonthlyTimeline,
  buildMonthlyChartSeries,
  buildMonthlyIncome,
  buildPortfolioDividendsPayload,
  calendarMonthsBetween,
  dividendPaymentDisplayCurrency,
  growthPillsFromCachePayload,
  incomeGrowthPillsFromMonthly,
  mergeEstAnnualIncome,
  paymentMatchesSymbol,
  rollingTtmMonthly,
  type PortfolioDividendPayment,
  type PortfolioDividendPosition,
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
        name: null,
        amount: 10,
        currency: "USD",
        paidOn: "2024-01-15",
      },
      {
        id: "2",
        source: "manual",
        ticker: "A",
        symbolYahoo: "A",
        name: null,
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
        name: null,
        amount: 10,
        currency: "USD",
        paidOn: "2024-03-15",
      },
      {
        id: "2",
        source: "t212",
        ticker: "MSFT",
        symbolYahoo: "MSFT",
        name: null,
        amount: 5,
        currency: "USD",
        paidOn: "2024-03-20",
      },
      {
        id: "3",
        source: "manual",
        ticker: "VOW3",
        symbolYahoo: "VOW3.DE",
        name: null,
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
  it("zero-fills quiet calendar months on the chart x-axis", () => {
    const monthly = buildMonthlyIncome([
      {
        id: "1",
        source: "manual",
        ticker: "AAPL",
        symbolYahoo: "AAPL",
        name: null,
        amount: 10,
        currency: "USD",
        paidOn: "2024-06-15",
      },
      {
        id: "2",
        source: "manual",
        ticker: "AAPL",
        symbolYahoo: "AAPL",
        name: null,
        amount: 20,
        currency: "USD",
        paidOn: "2024-08-15",
      },
    ]);
    const chart = buildMonthlyChartSeries(monthly, "USD", { eurPerUsd: null, gbpPerUsd: null });
    assert.deepEqual(
      chart.map((p) => ({ month: p.month, income: p.income })),
      [
        { month: "2024-06", income: 10 },
        { month: "2024-07", income: 0 },
        { month: "2024-08", income: 20 },
      ],
    );
  });

  it("returns null income when FX conversion is unavailable for foreign currency", () => {
    const monthly = buildMonthlyIncome([
      {
        id: "1",
        source: "manual",
        ticker: "VOW3",
        symbolYahoo: "VOW3.DE",
        name: null,
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
        name: null,
        amount: 10,
        currency: "EUR",
        paidOn: "2024-04-01",
      },
    ]);
    const chart = buildMonthlyChartSeries(monthly, "USD", { eurPerUsd: 0.5, gbpPerUsd: null });
    assert.equal(chart[0]!.income, 20);
  });

  it("converts pre-2026 BGN dividends to EUR for the chart", () => {
    const monthly = buildMonthlyIncome([
      {
        id: "1",
        source: "t212",
        ticker: "SXR8",
        symbolYahoo: "SXR8.DE",
        name: null,
        amount: 19.5583,
        currency: "BGN",
        paidOn: "2025-06-15",
      },
      {
        id: "2",
        source: "t212",
        ticker: "SXR8",
        symbolYahoo: "SXR8.DE",
        name: null,
        amount: 10,
        currency: "EUR",
        paidOn: "2026-02-15",
      },
    ]);
    const chart = buildMonthlyChartSeries(monthly, "EUR", { eurPerUsd: null, gbpPerUsd: null });
    assert.deepEqual(
      chart.map((p) => ({ month: p.month, income: p.income })),
      [
        { month: "2025-06", income: 10 },
        { month: "2025-07", income: 0 },
        { month: "2025-08", income: 0 },
        { month: "2025-09", income: 0 },
        { month: "2025-10", income: 0 },
        { month: "2025-11", income: 0 },
        { month: "2025-12", income: 0 },
        { month: "2026-01", income: 0 },
        { month: "2026-02", income: 10 },
      ],
    );
  });
});

describe("incomeGrowthPillsFromMonthly", () => {
  const fx = { eurPerUsd: 0.5, gbpPerUsd: null };

  it("returns null when fewer than 24 calendar months", () => {
    const monthly = buildMonthlyIncome([
      {
        id: "1",
        source: "manual",
        ticker: "A",
        symbolYahoo: "A",
        name: null,
        amount: 10,
        currency: "USD",
        paidOn: "2024-01-15",
      },
    ]);
    assert.equal(incomeGrowthPillsFromMonthly(monthly, "USD", fx), null);
  });

  it("converts foreign-currency history into the display currency before computing pills", () => {
    const payments: PortfolioDividendPayment[] = [];
    for (let i = 0; i < 24; i++) {
      const year = 2022 + Math.floor(i / 12);
      const month = String((i % 12) + 1).padStart(2, "0");
      payments.push({
        id: String(i),
        source: "manual",
        ticker: "VOW3",
        symbolYahoo: "VOW3.DE",
        name: null,
        amount: 10 + i,
        currency: "EUR",
        paidOn: `${year}-${month}-15`,
      });
    }
    const monthly = buildMonthlyIncome(payments);
    const pills = incomeGrowthPillsFromMonthly(monthly, "USD", fx);
    assert.ok(pills != null);
    assert.ok(pills.oneYear != null);
  });

  it("returns null when FX conversion is unavailable for foreign currency history", () => {
    const payments: PortfolioDividendPayment[] = [];
    for (let i = 0; i < 24; i++) {
      const year = 2022 + Math.floor(i / 12);
      const month = String((i % 12) + 1).padStart(2, "0");
      payments.push({
        id: String(i),
        source: "manual",
        ticker: "VOW3",
        symbolYahoo: "VOW3.DE",
        name: null,
        amount: 10,
        currency: "EUR",
        paidOn: `${year}-${month}-15`,
      });
    }
    const monthly = buildMonthlyIncome(payments);
    assert.equal(incomeGrowthPillsFromMonthly(monthly, "USD", { eurPerUsd: null, gbpPerUsd: null }), null);
  });
});

describe("mergeEstAnnualIncome", () => {
  const fx = { eurPerUsd: 0.5, gbpPerUsd: 0.8 };

  it("merges multi-currency positions into the target display currency", () => {
    const positions: PortfolioDividendPosition[] = [
      {
        symbol: "AAPL",
        name: "Apple",
        quantity: 10,
        avgPrice: 100,
        currency: "USD",
        price: 150,
        dividendYield: 0.01,
        dividendPerShare: 1,
        yieldOnCost: 1,
        estAnnualIncome: 100,
        growthPills: null,
      },
      {
        symbol: "VOW3.DE",
        name: "VW",
        quantity: 5,
        avgPrice: 100,
        currency: "EUR",
        price: 120,
        dividendYield: 0.02,
        dividendPerShare: 2,
        yieldOnCost: 2,
        estAnnualIncome: 50,
        growthPills: null,
      },
    ];
    assert.equal(mergeEstAnnualIncome(positions, "USD", fx), 200);
    assert.equal(mergeEstAnnualIncome(positions, "EUR", fx), 100);
  });

  it("converts BGN estimated income when merging to EUR", () => {
    const positions: PortfolioDividendPosition[] = [
      {
        symbol: "SXR8.DE",
        name: "iShares Core",
        quantity: 10,
        avgPrice: 100,
        currency: "BGN",
        price: 200,
        dividendYield: 0.01,
        dividendPerShare: 1,
        yieldOnCost: 1,
        estAnnualIncome: 19.5583,
        growthPills: null,
      },
    ];
    assert.ok(Math.abs((mergeEstAnnualIncome(positions, "EUR", fx) ?? 0) - 10) < 1e-6);
  });

  it("returns null when no convertible income exists", () => {
    const positions: PortfolioDividendPosition[] = [
      {
        symbol: "AAPL",
        name: "Apple",
        quantity: 10,
        avgPrice: 100,
        currency: "EUR",
        price: 150,
        dividendYield: 0.01,
        dividendPerShare: 1,
        yieldOnCost: 1,
        estAnnualIncome: 100,
        growthPills: null,
      },
    ];
    assert.equal(mergeEstAnnualIncome(positions, "USD", { eurPerUsd: null, gbpPerUsd: null }), null);
  });

  it("returns null for mixed currencies when FX cannot convert every position", () => {
    const positions: PortfolioDividendPosition[] = [
      {
        symbol: "AAPL",
        name: "Apple",
        quantity: 10,
        avgPrice: 100,
        currency: "USD",
        price: 150,
        dividendYield: 0.01,
        dividendPerShare: 1,
        yieldOnCost: 1,
        estAnnualIncome: 100,
        growthPills: null,
      },
      {
        symbol: "VOW3.DE",
        name: "VW",
        quantity: 5,
        avgPrice: 100,
        currency: "EUR",
        price: 120,
        dividendYield: 0.02,
        dividendPerShare: 2,
        yieldOnCost: 2,
        estAnnualIncome: 50,
        growthPills: null,
      },
    ];
    assert.equal(mergeEstAnnualIncome(positions, "EUR", { eurPerUsd: null, gbpPerUsd: null }), null);
  });

  it("returns null for empty positions", () => {
    assert.equal(mergeEstAnnualIncome([], "EUR", fx), null);
  });

  it("converts BGN estimated income when merging to USD", () => {
    const positions: PortfolioDividendPosition[] = [
      {
        symbol: "SXR8.DE",
        name: "iShares Core",
        quantity: 10,
        avgPrice: 100,
        currency: "BGN",
        price: 200,
        dividendYield: 0.01,
        dividendPerShare: 1,
        yieldOnCost: 1,
        estAnnualIncome: 19.5583,
        growthPills: null,
      },
    ];
    assert.ok(Math.abs((mergeEstAnnualIncome(positions, "USD", fx) ?? 0) - 20) < 1e-6);
  });
});

describe("buildFilledMonthlyAmountsInCurrency", () => {
  it("returns null when a paid month cannot be converted", () => {
    const monthly = buildMonthlyIncome([
      {
        id: "1",
        source: "manual",
        ticker: "VOW3",
        symbolYahoo: "VOW3.DE",
        name: null,
        amount: 20,
        currency: "EUR",
        paidOn: "2024-04-01",
      },
    ]);
    assert.equal(
      buildFilledMonthlyAmountsInCurrency(monthly, "USD", { eurPerUsd: null, gbpPerUsd: null }),
      null,
    );
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
    assert.ok(payload.fx);
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
        name: null,
      amount: 1,
      currency: "USD",
      paidOn: "2024-01-01",
    };
    assert.equal(paymentMatchesSymbol(p, "AAPL"), true);
    assert.equal(paymentMatchesSymbol(p, "AAPL_US_EQ"), true);
    assert.equal(paymentMatchesSymbol(p, "MSFT"), false);
  });
});

describe("dividendPaymentDisplayCurrency", () => {
  it("keeps BGN before 2026 and maps BGN to EUR from 2026-01", () => {
    assert.equal(dividendPaymentDisplayCurrency("2025-12-31", "BGN"), "BGN");
    assert.equal(dividendPaymentDisplayCurrency("2026-01-01", "BGN"), "EUR");
    assert.equal(dividendPaymentDisplayCurrency("2026-03-15", "BGN"), "EUR");
    assert.equal(dividendPaymentDisplayCurrency("2026-03-15", "EUR"), "EUR");
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
        name: null,
        amount: 10,
        currency: "USD",
        paidOn: "2024-01-15",
      },
      {
        id: "2",
        source: "t212",
        ticker: "AAPL",
        symbolYahoo: "AAPL",
        name: null,
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

  it("labels each month with its payment currency (BGN pre-2026, EUR from 2026)", () => {
    const payments: PortfolioDividendPayment[] = [
      {
        id: "1",
        source: "t212",
        ticker: "SXR8",
        symbolYahoo: "SXR8.DE",
        name: null,
        amount: 10,
        currency: "BGN",
        paidOn: "2025-06-15",
      },
      {
        id: "2",
        source: "t212",
        ticker: "SXR8",
        symbolYahoo: "SXR8.DE",
        name: null,
        amount: 6.71,
        currency: "EUR",
        paidOn: "2026-03-15",
      },
    ];
    const timeline = buildHoldingMonthlyTimeline(payments, "SXR8.DE");
    assert.equal(timeline.find((r) => r.month === "2025-06")?.currency, "BGN");
    assert.equal(timeline.find((r) => r.month === "2026-03")?.currency, "EUR");
  });

  it("maps mislabeled 2026 BGN payments to EUR in the timeline", () => {
    const payments: PortfolioDividendPayment[] = [
      {
        id: "1",
        source: "t212",
        ticker: "SXR8",
        symbolYahoo: "SXR8.DE",
        name: null,
        amount: 6.71,
        currency: "BGN",
        paidOn: "2026-03-15",
      },
    ];
    const timeline = buildHoldingMonthlyTimeline(payments, "SXR8.DE");
    assert.equal(timeline[0]?.currency, "EUR");
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

  it("resolves company names on dividend payments from quotes", () => {
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
          sector: null,
        },
      },
      fx: { eurPerUsd: null, gbpPerUsd: null },
      t212Items: [
        {
          ticker: "AAPL_US_EQ",
          amount: 5,
          currency: "USD",
          paidOn: "2024-06-15",
        },
      ],
      manualRows: [],
      cacheBySymbol: {},
      trading212: { connected: true },
    });
    assert.equal(payload.payments[0]?.name, "Apple Inc.");
  });
});
