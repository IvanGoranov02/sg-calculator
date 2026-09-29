import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BGN_PER_EUR,
  convertPortfolioMoney,
  dividendRateToMajorUnits,
  inferCurrencyFromSymbol,
  listingCurrencyOverride,
  normalizeQuotePrice,
  quoteCurrencyMajor,
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

  it("converts CHF when a USD rate is present and refuses it otherwise", () => {
    assert.equal(convertPortfolioMoney(10, "CHF", "EUR", fx), null);
    const eur = convertPortfolioMoney(10, "CHF", "EUR", { ...fx, usdPerUnit: { CHF: 1.1 } });
    assert.ok(eur != null);
    assert.equal(Number(eur!.toFixed(2)), 9.35);
  });
});

describe("normalizeQuotePrice", () => {
  it("converts GBp quotes to GBP", () => {
    const n = normalizeQuotePrice(539.7, "GBp");
    assert.equal(n.currency, "GBP");
    assert.equal(Number(n.price.toFixed(4)), 5.397);
  });
});

describe("quoteCurrencyMajor", () => {
  it("treats GBp as pence of GBP and leaves ISO codes alone", () => {
    assert.deepEqual(quoteCurrencyMajor("GBp"), { code: "GBP", minorPerMajor: 100 });
    assert.deepEqual(quoteCurrencyMajor("GBX"), { code: "GBP", minorPerMajor: 100 });
    assert.deepEqual(quoteCurrencyMajor("EUR"), { code: "EUR", minorPerMajor: 1 });
    assert.deepEqual(quoteCurrencyMajor("gbp"), { code: "GBP", minorPerMajor: 1 });
  });
});

describe("dividendRateToMajorUnits", () => {
  it("keeps a Yahoo dividendRate that is already pounds on a pence quote", () => {
    // VOD.L: price ~126.7 pence, dividendRate 0.04 pounds, yield ~3.16%.
    assert.equal(dividendRateToMajorUnits(0.04, 126.7, "GBp"), 0.04);
  });

  it("divides a dividendRate that is still in pence", () => {
    assert.equal(dividendRateToMajorUnits(4, 126.7, "GBp"), 0.04);
  });

  it("leaves a USD annual rate unchanged", () => {
    assert.equal(dividendRateToMajorUnits(2.1, 500, "USD"), 2.1);
  });
});
