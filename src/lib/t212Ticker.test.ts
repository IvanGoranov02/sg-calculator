import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  germanListingYahooSymbols,
  parseT212Ticker,
  t212TickerToYahoo,
  t212TickerToYahooCandidates,
} from "@/lib/t212Ticker";

describe("parseT212Ticker", () => {
  it("parses US listings", () => {
    assert.deepEqual(parseT212Ticker("AAPL_US_EQ"), {
      base: "AAPL",
      yahooSuffix: null,
      isNonUsListing: false,
    });
    assert.deepEqual(parseT212Ticker("BRK_B_US_EQ"), {
      base: "BRK-B",
      yahooSuffix: null,
      isNonUsListing: false,
    });
  });

  it("parses Xetra and Amsterdam suffix letters", () => {
    assert.deepEqual(parseT212Ticker("MSFTd_EQ"), {
      base: "MSFT",
      yahooSuffix: ".DE",
      isNonUsListing: true,
    });
    assert.deepEqual(parseT212Ticker("ASMLa_EQ"), {
      base: "ASML",
      yahooSuffix: ".AS",
      isNonUsListing: true,
    });
    assert.deepEqual(parseT212Ticker("BPl_EQ"), {
      base: "BP",
      yahooSuffix: ".L",
      isNonUsListing: true,
    });
  });
});

describe("germanListingYahooSymbols", () => {
  it("lists truncated 3-char variants before full symbols", () => {
    assert.deepEqual(germanListingYahooSymbols("MSFT"), ["MSF.DE", "MSF.F", "MSFT.DE", "MSFT.F"]);
    assert.deepEqual(germanListingYahooSymbols("AMZN"), ["AMZ.DE", "AMZ.F", "AMZN.DE", "AMZN.F"]);
  });
});

describe("t212TickerToYahoo", () => {
  it("maps Xetra US names to German Yahoo symbols", () => {
    assert.equal(t212TickerToYahoo("MSFTd_EQ"), "MSF.DE");
    assert.equal(t212TickerToYahoo("AMZd_EQ"), "AMZ.DE");
  });

  it("maps Amsterdam and London listings", () => {
    assert.equal(t212TickerToYahoo("ASMLa_EQ"), "ASML.AS");
    assert.equal(t212TickerToYahoo("BPl_EQ"), "BP.L");
  });

  it("keeps US tickers bare", () => {
    assert.equal(t212TickerToYahoo("AAPL_US_EQ"), "AAPL");
    assert.equal(t212TickerToYahoo("BRK_B_US_EQ"), "BRK-B");
  });
});

describe("t212TickerToYahooCandidates", () => {
  it("does not include the AMZD bear ETF stub for Xetra Amazon", () => {
    const c = t212TickerToYahooCandidates("AMZd_EQ", "EUR");
    assert.ok(c.includes("AMZ.DE"));
    assert.ok(!c.includes("AMZD"));
  });

  it("prefers EUR listings when holding currency is EUR", () => {
    const c = t212TickerToYahooCandidates("MSFTd_EQ", "EUR");
    assert.equal(c[0], "MSF.DE");
    assert.ok(c.indexOf("MSF.DE") < c.indexOf("MSFT"));
  });
});
