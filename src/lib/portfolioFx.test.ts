import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BGN_PER_EUR,
  convertPortfolioMoney,
  createPortfolioFxRatesLoader,
  currencyForYahooSuffix,
  dividendRateToMajorUnits,
  inferCurrencyFromSymbol,
  listingCurrencyOverride,
  loadPortfolioFxRatesFromQuotes,
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

  it("uses the local currency for non-euro exchanges", () => {
    const listings: Record<string, string> = {
      "RY.TO": "CAD", "SHOP.V": "CAD", "NESN.SW": "CHF", "NESN.VX": "CHF",
      "VOLV-B.ST": "SEK", "EQNR.OL": "NOK", "NOVO-B.CO": "DKK", "PKN.WA": "PLN",
      "ICEAIR.IC": "ISK", "BHP.AX": "AUD", "AIR.NZ": "NZD", "0700.HK": "HKD",
      "7203.T": "JPY", "CEZ.PR": "CZK", "OTP.BD": "HUF",
    };
    for (const [symbol, currency] of Object.entries(listings)) {
      assert.equal(inferCurrencyFromSymbol(symbol), currency, symbol);
      assert.equal(listingCurrencyOverride(symbol), currency, symbol);
    }
    assert.equal(currencyForYahooSuffix(" .st "), "SEK");
    assert.equal(currencyForYahooSuffix(".UNKNOWN"), null);
  });
});

describe("loadPortfolioFxRatesFromQuotes", () => {
  it("loads a USD cross-rate for every supported non-euro exchange currency", async () => {
    const requested = new Set<string>();
    const fx = await loadPortfolioFxRatesFromQuotes(async (symbol) => {
      requested.add(symbol);
      if (symbol === "EURUSD=X") return 1 / 0.85;
      if (symbol === "GBPUSD=X") return 1 / 0.75;
      return 0.1;
    });
    assert.equal(fx.eurPerUsd, 0.85);
    assert.equal(fx.gbpPerUsd, 0.75);
    for (const currency of ["CHF", "CAD", "AUD", "HKD", "JPY", "SEK", "NOK", "DKK", "PLN", "ISK", "NZD", "CZK", "HUF"]) {
      assert.ok(requested.has(`${currency}USD=X`), currency);
      assert.equal(fx.usdPerUnit?.[currency], 0.1);
      assert.equal(convertPortfolioMoney(100, currency, "EUR", fx), 8.5);
    }
  });

  it("keeps failed or invalid pairs unavailable without dropping the other rates", async () => {
    const fx = await loadPortfolioFxRatesFromQuotes(async (symbol) => {
      if (symbol === "SEKUSD=X") throw new Error("Yahoo unavailable");
      if (symbol === "NOKUSD=X") return NaN;
      if (symbol === "DKKUSD=X") return Infinity;
      if (symbol === "PLNUSD=X") return 0;
      return 1;
    });
    assert.equal(fx.eurPerUsd, 1);
    assert.equal(fx.usdPerUnit?.CHF, 1);
    for (const currency of ["SEK", "NOK", "DKK", "PLN"]) {
      assert.equal(fx.usdPerUnit?.[currency], undefined);
      assert.equal(convertPortfolioMoney(100, currency, "EUR", fx), null);
    }
  });

  it("does not expose a non-finite inverse EUR or GBP rate", async () => {
    const fx = await loadPortfolioFxRatesFromQuotes(async (symbol) => {
      return symbol === "EURUSD=X" || symbol === "GBPUSD=X" ? Number.MIN_VALUE : 1;
    });
    assert.equal(fx.eurPerUsd, null);
    assert.equal(fx.gbpPerUsd, null);
  });
});

describe("createPortfolioFxRatesLoader", () => {
  it("shares concurrent requests and cached rates, then refreshes after TTL expiry", async () => {
    let now = 0;
    let requests = 0;
    const load = createPortfolioFxRatesLoader(async () => {
      requests += 1;
      return 1;
    }, { ttlMs: 60_000, now: () => now });
    const [first, concurrent] = await Promise.all([load(), load()]);
    const firstFetchCount = requests;
    assert.equal(firstFetchCount, 15);
    assert.equal(concurrent, first);
    now = 59_999;
    assert.equal(await load(), first);
    assert.equal(requests, firstFetchCount);
    now = 60_000;
    assert.notEqual(await load(), first);
    assert.equal(requests, firstFetchCount * 2);
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

  it("refuses missing and non-finite cross-rates instead of producing NaN or Infinity", () => {
    for (const invalid of [null, NaN, Infinity, -Infinity, 0, -1]) {
      const missingFx = { eurPerUsd: invalid, gbpPerUsd: invalid, usdPerUnit: { SEK: invalid } };
      assert.equal(convertPortfolioMoney(100, "EUR", "USD", missingFx), null);
      assert.equal(convertPortfolioMoney(100, "USD", "EUR", missingFx), null);
      assert.equal(convertPortfolioMoney(100, "GBP", "USD", missingFx), null);
      assert.equal(convertPortfolioMoney(100, "USD", "GBP", missingFx), null);
      assert.equal(convertPortfolioMoney(100, "SEK", "USD", missingFx), null);
      assert.equal(convertPortfolioMoney(100, "USD", "SEK", missingFx), null);
    }
    assert.equal(convertPortfolioMoney(100, "SEK", "SEK", { eurPerUsd: null, gbpPerUsd: null }), 100);
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
