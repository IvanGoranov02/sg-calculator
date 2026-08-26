import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  convertPortfolioMoney,
  inferCurrencyFromSymbol,
  listingCurrencyOverride,
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
});
