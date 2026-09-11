import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BGN_PER_EUR,
  convertPortfolioMoney,
  inferCurrencyFromSymbol,
  listingCurrencyOverride,
  normalizeQuotePrice,
} from "@/lib/portfolioFx";

describe("listingCurrencyOverride", () => {
  it("does not force USD over a euro default for US tickers", () => {
    assert.equal(listingCurrencyOverride("AAPL"), null);
    assert.equal(listingCurrencyOverride("MSFT"), null);
    assert.equal(inferCurrencyFromSymbol("AAPL"), "USD");
  });

  it("hints EUR/GBP from exchange suffixes", () => {
    assert.equal(listingCurrencyOverride("SAP.DE"), "EUR");
    assert.equal(listingCurrencyOverride("AIR.PA"), "EUR");
    assert.equal(listingCurrencyOverride("RR.L"), "GBP");
  });
});

describe("convertPortfolioMoney", () => {
  const fx = { eurPerUsd: 0.85, gbpPerUsd: 0.75 };

  it("converts a USD quote into a EUR holding", () => {
    const eur = convertPortfolioMoney(200, "USD", "EUR", fx);
    assert.ok(eur != null);
    assert.equal(Number(eur.toFixed(2)), 170);
  });

  it("leaves same-currency amounts unchanged", () => {
    assert.equal(convertPortfolioMoney(50, "EUR", "EUR", fx), 50);
  });

  it("converts BGN to EUR via the official peg without live FX", () => {
    const eur = convertPortfolioMoney(19.5583, "BGN", "EUR", { eurPerUsd: null, gbpPerUsd: null });
    assert.ok(eur != null);
    assert.equal(Number(eur!.toFixed(4)), 10);
  });

  it("converts BGN to USD through EUR peg and spot FX", () => {
    const usd = convertPortfolioMoney(BGN_PER_EUR, "BGN", "USD", fx);
    assert.ok(usd != null);
    assert.equal(Number(usd!.toFixed(2)), 1.18);
  });
});

describe("normalizeQuotePrice", () => {
  it("converts GBp quotes to GBP", () => {
    const n = normalizeQuotePrice(539.7, "GBp");
    assert.equal(n.currency, "GBP");
    assert.equal(Number(n.price.toFixed(4)), 5.397);
  });
});
