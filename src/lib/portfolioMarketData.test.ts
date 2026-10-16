import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { estimateHoldingAnnualDividend } from "@/lib/portfolioDividends";
import { mergeBrokerQuote, rawQuoteToRow, trailing365DividendSum, type PortfolioQuoteRow } from "@/lib/portfolioMarketData";

describe("portfolio quotes for pence listings", () => {
  it("keeps an annual dividend already quoted in pounds when estimating portfolio income", () => {
    const quote = rawQuoteToRow("VOD.L", "VOD.L", {
      quoteType: "EQUITY",
      regularMarketPrice: 126.7,
      currency: "GBp",
      dividendRate: 0.04,
      trailingAnnualDividendYield: 0.04 / 1.267,
    }, null);
    assert.ok(quote);
    assert.equal(quote.currency, "GBP");
    assert.ok(Math.abs(quote.price - 1.267) < 1e-12);
    assert.equal(quote.dividendRate, 0.04);

    const estimate = estimateHoldingAnnualDividend(
      { quantity: 100, currency: "GBP" },
      quote,
      { eurPerUsd: null, gbpPerUsd: null },
    );
    assert.equal(estimate?.estAnnualIncome, 4);
  });

  it("converts an annual rate that Yahoo still reports in pence", () => {
    const quote = rawQuoteToRow("VOD.L", "VOD.L", {
      quoteType: "EQUITY",
      regularMarketPrice: 126.7,
      currency: "GBp",
      dividendRate: 4,
    }, null);
    assert.equal(quote?.dividendRate, 0.04);
  });
});

function row(symbol: string, currency = "EUR"): PortfolioQuoteRow {
  return {
    symbol, resolvedYahooSymbol: symbol, name: symbol, price: 100, currency,
    dividendRate: 4, dividendYield: 0.04, lastDividendPerShare: 1,
    changePercent: 0, twoHundredDayAverage: 100, dipVsSma200Pct: 0,
    sector: null, nextEarnings: null,
  };
}

describe("broker quote dividend units", () => {
  it("preserves USD annual and cash dividends while displaying a broker EUR price", () => {
    const quote = mergeBrokerQuote("AAPL", row("AAPL", "USD"), { price: 85, currency: "EUR" });
    assert.equal(quote.currency, "EUR");
    assert.equal(quote.dividendCurrency, "USD");
    assert.equal(quote.lastDividendCurrency, "USD");
    const estimate = estimateHoldingAnnualDividend({ quantity: 100, currency: "EUR" }, quote,
      { eurPerUsd: 0.85, gbpPerUsd: null });
    assert.equal(estimate?.estAnnualIncome, 340);
  });

  it("preserves the EUR-listing USD latest cash heuristic before changing broker price", () => {
    const quote = mergeBrokerQuote("MSF.DE", {
      ...row("MSF.DE"), price: 447.2, dividendYield: 0.0076, dividendRate: 3.4, lastDividendPerShare: 0.98,
    }, { price: 1, currency: "EUR" });
    assert.equal(quote.dividendCurrency, "EUR");
    assert.equal(quote.lastDividendCurrency, "USD");
  });

  it("uses raw GBp price units even when summary currency is GBP", () => {
    const quote = rawQuoteToRow("VOD.L", "VOD.L", {
      regularMarketPrice: 126.7, currency: "GBp", dividendRate: 0.04,
    }, { summaryDetail: { currency: "GBP" } });
    assert.ok(quote);
    assert.ok(Math.abs(quote.price - 1.267) < 1e-12);
    assert.equal(quote.dividendCurrency, "GBP");
  });
});


describe("mixed listing annual portfolio total", () => {
  it("includes every holding and uses annual DPS rather than the last quarterly cash", async () => {
    const { buildPortfolioDividendsPayload, mergeEstAnnualIncome } = await import("@/lib/portfolioDividends");
    const uk = rawQuoteToRow("VOD.L", "VOD.L", {
      regularMarketPrice: 126.7, currency: "GBp", dividendRate: 0.04,
      lastDividendValue: 1,
    }, null)!;
    const fx = { eurPerUsd: 0.85, gbpPerUsd: 0.75 };
    // €30 from a euro listing, €34 from USD annual DPS and €11 from pounds.
    const payload = buildPortfolioDividendsPayload({
      holdings: [
        { symbolYahoo: "SAP.DE", symbolT212: null, quantity: 10, avgPrice: 100, currency: "EUR" },
        { symbolYahoo: "AAPL", symbolT212: null, quantity: 10, avgPrice: 85, currency: "EUR" },
        { symbolYahoo: "VOD.L", symbolT212: null, quantity: 242.64705882352942, avgPrice: 1, currency: "EUR" },
      ].map((holding) => ({
        ...holding,
        quantity: holding.quantity as unknown as import("@prisma/client").PortfolioHolding["quantity"],
        avgPrice: holding.avgPrice as unknown as import("@prisma/client").PortfolioHolding["avgPrice"],
      })),
      quotes: {
        "SAP.DE": { ...row("SAP.DE"), dividendRate: 3 },
        AAPL: mergeBrokerQuote("AAPL", row("AAPL", "USD"), { price: 85, currency: "EUR" }),
        "VOD.L": uk,
      },
      fx, t212Items: [], manualRows: [], cacheBySymbol: {}, trading212: { connected: false },
      today: "2026-10-06",
    });
    assert.equal(payload.positions.length, 3);
    assert.ok(Math.abs(mergeEstAnnualIncome(payload.positions, "EUR", fx)! - 75) < 1e-9);
  });
});

describe("trailing 365-day cash dividends", () => {
  const now = new Date("2026-10-16T00:00:00Z");
  const chart = (amounts: number[]) => ({ events: { dividends: amounts.map((amount, i) => ({
    amount, date: new Date(now.getTime() - (30 + i * 90) * 86_400_000),
  })) } });

  it("sums UNH quarters rather than relying on the incomplete quote rate", () => {
    assert.ok(Math.abs(trailing365DividendSum(chart([2.21, 2.21, 2.32, 2.32]), "USD", now) - 9.06) < 1e-12);
  });

  it("recovers ASML dividends when the quote rate is zero", () => {
    assert.ok(Math.abs(trailing365DividendSum(chart([1.6, 1.6, 2.7, 1.88]), "EUR", now) - 7.78) < 1e-12);
  });

  it("converts pence events to pounds without scaling major-unit events", () => {
    assert.equal(trailing365DividendSum(chart([10, 20]), "GBp", now), 0.3);
    assert.equal(trailing365DividendSum(chart([10, 20]), "GBX", now), 0.3);
    assert.equal(trailing365DividendSum(chart([0.1, 0.2]), "GBP", now), 0.1 + 0.2);
  });

  it("supports timestamp maps and includes only valid positive events within the window", () => {
    const cutoff = now.getTime() - 365 * 86_400_000;
    const events = [
      { date: cutoff / 1000, amount: 1 },
      { date: now, amount: 2 },
      { date: "2026-10-15", amount: 3 },
      { date: now.getTime() - 86400000, amount: 4 },
      { date: cutoff - 1, amount: 100 },
      { date: now.getTime() + 1, amount: 100 },
      { date: "invalid", amount: 100 },
      { date: now, amount: -1 },
      { date: now, amount: 0 },
      { date: now, amount: NaN },
      { date: now, amount: Infinity },
      null,
    ];
    assert.equal(trailing365DividendSum({ events: { dividends: Object.fromEntries(events.map((event, i) => [i, event])) } }, "USD", now), 10);
  });

  it("returns zero for missing or empty events", () => {
    for (const chart of [null, {}, { events: {} }, { events: { dividends: [] } }]) {
      assert.equal(trailing365DividendSum(chart, "USD", now), 0);
    }
  });
});
