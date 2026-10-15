import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import { estimateHoldingAnnualDividend } from "@/lib/portfolioDividends";
import { fetchPortfolioQuotesForHoldings, mergeBrokerQuote, rawQuoteToRow, resolvePortfolioQuoteCandidates, type PortfolioQuoteRow } from "@/lib/portfolioMarketData";
import { yahooFinance } from "@/lib/yahooFinanceClient";
import { buildBlockedYahooSymbols } from "@/lib/portfolioQuoteResolve";

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

describe("bounded portfolio listing resolution", () => {
  it("requests only the exact mapped listing when it is valid", async () => {
    const requested: string[] = [];
    const chosen = await resolvePortfolioQuoteCandidates(["APC.DE", "APC.F", "AAPL.DE", "AAPL"], "EUR", "AAPLd_EQ",
      buildBlockedYahooSymbols("APC.DE", "AAPLd_EQ"), async (sym) => {
        requested.push(sym);
        return row(sym);
      });
    assert.equal(chosen?.resolvedYahooSymbol, "APC.DE");
    assert.deepEqual(requested, ["APC.DE"]);
  });

  it("rejects wrong currency and blocked US traps before finding the correct venue", async () => {
    const requested: string[] = [];
    const chosen = await resolvePortfolioQuoteCandidates(["AMZD", "AMZ.DE", "AMZ.F"], "EUR", "AMZd_EQ",
      buildBlockedYahooSymbols("AMZD", "AMZd_EQ"), async (sym) => {
        requested.push(sym);
        return row(sym, sym === "AMZ.DE" ? "USD" : "EUR");
      });
    assert.equal(chosen?.resolvedYahooSymbol, "AMZ.F");
    assert.deepEqual(requested, ["AMZ.DE", "AMZ.F"]);
  });

  it("caps unsuccessful fallback probes and stops before an aborted resolution", async () => {
    let calls = 0;
    const load = async () => { calls += 1; return null; };
    const candidates = Array.from({ length: 30 }, (_, i) => `NOPE${i}.DE`);
    assert.equal(await resolvePortfolioQuoteCandidates(candidates, "EUR", null, new Set(), load), null);
    assert.equal(calls, 8);
    assert.equal(await resolvePortfolioQuoteCandidates(candidates, "EUR", null, new Set(), load, AbortSignal.abort()), null);
    assert.equal(calls, 8);
  });

  it("deduplicates concurrent quote loads and reuses successful quotes across portfolio aliases", async () => {
    let calls = 0;
    const quoteMock = mock.method(yahooFinance, "quote", async (sym: string) => {
      calls += 1;
      return { symbol: sym, regularMarketPrice: 100, currency: "EUR", quoteType: "EQUITY", dividendRate: 4 };
    });
    const summaryMock = mock.method(yahooFinance, "quoteSummary", async () => null);
    try {
      const first = [{ symbolYahoo: "DEDUPE.DE", symbolT212: null, currency: "EUR" }];
      const [a, b] = await Promise.all([fetchPortfolioQuotesForHoldings(first), fetchPortfolioQuotesForHoldings(first)]);
      assert.equal(a["DEDUPE.DE"]?.price, 100);
      assert.equal(b["DEDUPE.DE"]?.price, 100);
      await fetchPortfolioQuotesForHoldings(first);
      assert.equal(calls, 1);
    } finally {
      quoteMock.mock.restore();
      summaryMock.mock.restore();
    }
  });
});
