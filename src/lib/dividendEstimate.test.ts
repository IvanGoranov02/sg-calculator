import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEventDividendEstimatesBySymbol,
  estimateEventDividendPayment,
  inferPaymentsPerYearFromHistory,
  lookupPortfolioQuote,
  periodizeAnnualDividend,
  type EventDividendHoldingInput,
} from "@/lib/dividendEstimate";
import type { PortfolioDividendPayment } from "@/lib/portfolioDividends";
import type { PortfolioQuoteRow } from "@/lib/portfolioMarketData";

const FX = { eurPerUsd: 1, gbpPerUsd: 1.25 };

function quote(overrides: Partial<PortfolioQuoteRow> = {}): PortfolioQuoteRow {
  return {
    symbol: "AAPL",
    name: "Apple",
    price: 150,
    currency: "USD",
    dividendYield: null,
    dividendRate: 4,
    changePercent: 0,
    twoHundredDayAverage: null,
    sector: null,
    dipVsSma200Pct: null,
    nextEarnings: null,
    ...overrides,
  };
}

describe("periodizeAnnualDividend", () => {
  it("splits annual into month (/12) and day (/365)", () => {
    const r = periodizeAnnualDividend(1200)!;
    assert.equal(r.annual, 1200);
    assert.equal(r.month, 100);
    assert.ok(Math.abs(r.day - 1200 / 365) < 1e-12);
  });

  it("keeps a zero estimate as zeros", () => {
    const r = periodizeAnnualDividend(0)!;
    assert.equal(r.annual, 0);
    assert.equal(r.month, 0);
    assert.equal(r.day, 0);
  });

  it("returns null for non-finite or negative input", () => {
    assert.equal(periodizeAnnualDividend(Number.NaN), null);
    assert.equal(periodizeAnnualDividend(Number.POSITIVE_INFINITY), null);
    assert.equal(periodizeAnnualDividend(-1), null);
  });
});

describe("inferPaymentsPerYearFromHistory", () => {
  const payments: PortfolioDividendPayment[] = [
    {
      id: "1",
      source: "manual",
      ticker: "AAPL",
      symbolYahoo: "AAPL",
      name: null,
      amount: 10,
      currency: "USD",
      paidOn: "2025-03-15",
    },
    {
      id: "2",
      source: "manual",
      ticker: "AAPL",
      symbolYahoo: "AAPL",
      name: null,
      amount: 10,
      currency: "USD",
      paidOn: "2025-06-15",
    },
    {
      id: "3",
      source: "manual",
      ticker: "AAPL",
      symbolYahoo: "AAPL",
      name: null,
      amount: 10,
      currency: "USD",
      paidOn: "2025-09-15",
    },
    {
      id: "4",
      source: "manual",
      ticker: "AAPL",
      symbolYahoo: "AAPL",
      name: null,
      amount: 10,
      currency: "USD",
      paidOn: "2025-12-15",
    },
  ];

  it("counts trailing-year payments for the symbol", () => {
    const asOf = new Date("2026-01-01T12:00:00Z").getTime();
    assert.equal(inferPaymentsPerYearFromHistory(payments, "AAPL", { asOfMs: asOf }), 4);
  });

  it("defaults to quarterly when no matching payments exist", () => {
    assert.equal(inferPaymentsPerYearFromHistory(payments, "MSFT"), 4);
  });

  it("defaults to quarterly when trailing-year payment count exceeds 12", () => {
    const asOf = Date.now();
    const monthly: PortfolioDividendPayment[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(asOf);
      d.setUTCDate(d.getUTCDate() - i * 20);
      monthly.push({
        id: String(i),
        source: "manual",
        ticker: "MONTH",
        symbolYahoo: "MONTH",
        name: null,
        amount: 1,
        currency: "USD",
        paidOn: d.toISOString().slice(0, 10),
      });
    }
    assert.equal(inferPaymentsPerYearFromHistory(monthly, "MONTH", { asOfMs: asOf }), 4);
  });

  it("infers quarterly frequency when only two payments exist in trailing year (META-like)", () => {
    const asOf = new Date("2026-09-23T12:00:00Z").getTime();
    const metaPayments: PortfolioDividendPayment[] = [
      {
        id: "1",
        source: "manual",
        ticker: "META",
        symbolYahoo: "META",
        name: null,
        amount: 1.995,
        currency: "USD",
        paidOn: "2025-06-16",
      },
      {
        id: "2",
        source: "manual",
        ticker: "META",
        symbolYahoo: "META",
        name: null,
        amount: 1.995,
        currency: "USD",
        paidOn: "2025-09-22",
      },
    ];
    assert.equal(
      inferPaymentsPerYearFromHistory(metaPayments, "META", {
        asOfMs: asOf,
        quantity: 3.8,
        annualPerShare: 2.1,
        annualIncome: 7.98,
      }),
      4,
    );
  });
});

describe("estimateEventDividendPayment", () => {
  it("uses annual dividend rate divided by payment frequency", () => {
    const estimate = estimateEventDividendPayment({
      symbol: "AAPL",
      quantity: 10,
      currency: "USD",
      quote: quote({ dividendRate: 4 }),
      fx: FX,
    });
    assert.deepEqual(estimate, { amount: 10, currency: "USD" });
  });

  it("falls back to market value times yield when rate is missing", () => {
    const estimate = estimateEventDividendPayment({
      symbol: "AAPL",
      quantity: 10,
      currency: "USD",
      quote: quote({ dividendRate: null, dividendYield: 0.02, price: 100 }),
      fx: FX,
    });
    assert.deepEqual(estimate, { amount: 5, currency: "USD" });
  });

  it("returns null when the holding has no dividend estimate", () => {
    const estimate = estimateEventDividendPayment({
      symbol: "AAPL",
      quantity: 10,
      currency: "USD",
      quote: quote({ dividendRate: null, dividendYield: null }),
      fx: FX,
    });
    assert.equal(estimate, null);
  });

  it("uses payment history to refine per-payment amount", () => {
    const asOf = new Date("2026-06-15T12:00:00Z").getTime();
    const payments: PortfolioDividendPayment[] = [
      "2026-03-15",
      "2025-12-15",
      "2025-09-15",
      "2025-07-01",
    ].map((paidOn, i) => ({
      id: String(i + 1),
      source: "manual" as const,
      ticker: "AAPL",
      symbolYahoo: "AAPL",
      name: null,
      amount: 10,
      currency: "USD",
      paidOn,
    }));

    const withoutHistory = estimateEventDividendPayment({
      symbol: "AAPL",
      quantity: 10,
      currency: "USD",
      quote: quote({ dividendRate: 8 }),
      fx: FX,
    });
    const withHistory = estimateEventDividendPayment({
      symbol: "AAPL",
      quantity: 10,
      currency: "USD",
      quote: quote({ dividendRate: 8 }),
      fx: FX,
      payments,
    });

    assert.deepEqual(withoutHistory, { amount: 20, currency: "USD" });
    assert.equal(
      inferPaymentsPerYearFromHistory(payments, "AAPL", {
        asOfMs: asOf,
        quantity: 10,
        annualPerShare: 8,
        annualIncome: 80,
      }),
      4,
    );
    assert.deepEqual(withHistory, { amount: 20, currency: "USD" });
  });

  it("META-like holding: shares × quarterly DPS, not annual rate as total", () => {
    const asOf = Date.now();
    const payments: PortfolioDividendPayment[] = [
      {
        id: "1",
        source: "manual",
        ticker: "META",
        symbolYahoo: "META",
        name: null,
        amount: 1.995,
        currency: "USD",
        paidOn: new Date(asOf - 90 * 86_400_000).toISOString().slice(0, 10),
      },
      {
        id: "2",
        source: "manual",
        ticker: "META",
        symbolYahoo: "META",
        name: null,
        amount: 1.995,
        currency: "USD",
        paidOn: new Date(asOf - 30 * 86_400_000).toISOString().slice(0, 10),
      },
    ];
    const estimate = estimateEventDividendPayment({
      symbol: "META",
      quantity: 3.8,
      currency: "USD",
      quote: quote({ symbol: "META", dividendRate: 2.1 }),
      fx: FX,
      payments,
    });
    assert.ok(estimate);
    assert.ok(Math.abs(estimate.amount - 1.995) < 0.02);
  });

  it("lowers per-payment amount when history shows monthly dividends", () => {
    const asOf = Date.now();
    const payments: PortfolioDividendPayment[] = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(asOf);
      d.setUTCDate(d.getUTCDate() - (i + 1) * 20);
      return {
        id: String(i),
        source: "manual" as const,
        ticker: "MONTH",
        symbolYahoo: "MONTH",
        name: null,
        amount: 12,
        currency: "USD",
        paidOn: d.toISOString().slice(0, 10),
      };
    });

    const quarterlyDefault = estimateEventDividendPayment({
      symbol: "MONTH",
      quantity: 12,
      currency: "USD",
      quote: quote({ symbol: "MONTH", dividendRate: 12 }),
      fx: FX,
    });
    const monthlyHistory = estimateEventDividendPayment({
      symbol: "MONTH",
      quantity: 12,
      currency: "USD",
      quote: quote({ symbol: "MONTH", dividendRate: 12 }),
      fx: FX,
      payments,
    });

    assert.deepEqual(quarterlyDefault, { amount: 36, currency: "USD" });
    assert.deepEqual(monthlyHistory, { amount: 12, currency: "USD" });
  });
});

describe("lookupPortfolioQuote", () => {
  it("finds quotes by uppercase holding key", () => {
    const q = quote({ symbol: "AAPL" });
    const found = lookupPortfolioQuote({ AAPL: q }, "aapl");
    assert.equal(found, q);
  });

  it("finds quotes by resolved Yahoo symbol", () => {
    const q = quote({ symbol: "BRK-B", resolvedYahooSymbol: "BRK.B" });
    const found = lookupPortfolioQuote({ "BRK-B": q }, "BRK.B");
    assert.equal(found, q);
  });
});

describe("buildEventDividendEstimatesBySymbol", () => {
  const holdings: EventDividendHoldingInput[] = [
    { symbolYahoo: "AAPL", quantity: "10", currency: "USD" },
    { symbolYahoo: "AAPL", quantity: "5", currency: "USD" },
  ];

  it("aggregates multiple holdings for the same symbol in display currency", () => {
    const map = buildEventDividendEstimatesBySymbol({
      holdings,
      quotes: { AAPL: quote({ dividendRate: 4 }) },
      fx: FX,
      displayCurrency: "USD",
    });
    const est = map.get("AAPL");
    assert.ok(est);
    assert.equal(est.estimate.amount, 15);
    assert.equal(est.estimate.currency, "USD");
  });

  it("aliases resolved Yahoo symbols for event lookup", () => {
    const map = buildEventDividendEstimatesBySymbol({
      holdings: [{ symbolYahoo: "BRK-B", quantity: "2", currency: "USD" }],
      quotes: {
        "BRK-B": quote({
          symbol: "BRK-B",
          resolvedYahooSymbol: "BRK.B",
          dividendRate: 8,
          price: 400,
        }),
      },
      fx: FX,
      displayCurrency: "USD",
    });
    assert.deepEqual(map.get("BRK-B")?.estimate, { amount: 4, currency: "USD" });
    assert.deepEqual(map.get("BRK.B")?.estimate, { amount: 4, currency: "USD" });
  });

  it("omits symbols without a dividend estimate", () => {
    const map = buildEventDividendEstimatesBySymbol({
      holdings: [{ symbolYahoo: "GROW", quantity: "1", currency: "USD" }],
      quotes: { GROW: quote({ symbol: "GROW", dividendRate: null, dividendYield: null }) },
      fx: FX,
      displayCurrency: "USD",
    });
    assert.equal(map.size, 0);
  });

  it("converts aggregated estimates to EUR display currency", () => {
    const map = buildEventDividendEstimatesBySymbol({
      holdings: [{ symbolYahoo: "AAPL", quantity: "10", currency: "USD" }],
      quotes: { AAPL: quote({ dividendRate: 4 }) },
      fx: { eurPerUsd: 0.5, gbpPerUsd: null },
      displayCurrency: "EUR",
    });
    const est = map.get("AAPL");
    assert.ok(est);
    assert.equal(est.estimate.currency, "EUR");
    assert.equal(est.estimate.amount, 5);
  });

  it("does not double-count dual-alias holdings (BRK-B and BRK.B)", () => {
    const brkQuote = quote({
      symbol: "BRK-B",
      resolvedYahooSymbol: "BRK.B",
      dividendRate: 8,
      price: 400,
    });
    const map = buildEventDividendEstimatesBySymbol({
      holdings: [
        { symbolYahoo: "BRK-B", quantity: "2", currency: "USD" },
        { symbolYahoo: "BRK.B", quantity: "3", currency: "USD" },
      ],
      quotes: { "BRK-B": brkQuote, "BRK.B": brkQuote },
      fx: FX,
      displayCurrency: "USD",
    });
    assert.deepEqual(map.get("BRK-B")?.estimate, { amount: 10, currency: "USD" });
    assert.deepEqual(map.get("BRK.B")?.estimate, { amount: 10, currency: "USD" });
  });
});
