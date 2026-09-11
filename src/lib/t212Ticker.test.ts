import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  germanListingYahooSymbols,
  parseT212Ticker,
  t212QuoteCurrency,
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

  it("parses uppercase Xetra stubs (FB2AD_EQ, METAD_EQ, ABEAD_EQ)", () => {
    assert.deepEqual(parseT212Ticker("FB2AD_EQ"), {
      base: "FB2A",
      yahooSuffix: ".DE",
      isNonUsListing: true,
    });
    assert.deepEqual(parseT212Ticker("METAD_EQ"), {
      base: "META",
      yahooSuffix: ".DE",
      isNonUsListing: true,
    });
    assert.deepEqual(parseT212Ticker("ABEAD_EQ"), {
      base: "ABEA",
      yahooSuffix: ".DE",
      isNonUsListing: true,
    });
  });
});

describe("germanListingYahooSymbols", () => {
  it("lists truncated 3-char variants before full symbols", () => {
    assert.deepEqual(germanListingYahooSymbols("MSFT"), ["MSF.DE", "MSF.F", "MSFT.DE", "MSFT.F"]);
    assert.deepEqual(germanListingYahooSymbols("AMZN"), ["AMZ.DE", "AMZ.F", "AMZN.DE", "AMZN.F"]);
  });

  it("does not truncate digit tickers and maps Meta to FB2A.DE", () => {
    assert.deepEqual(germanListingYahooSymbols("FB2A"), [
      "FB2A.DE",
      "FB2A.F",
      "FB2AD.XC",
      "FB2AD.XD",
    ]);
    assert.deepEqual(germanListingYahooSymbols("META"), [
      "FB2A.DE",
      "FB2A.F",
      "FB2AD.XC",
      "FB2AD.XD",
    ]);
    assert.ok(!germanListingYahooSymbols("FB2A").includes("FB2.DE"));
  });

  it("maps Alphabet Class A to ABEA.DE and avoids wrong ABE.F trap", () => {
    assert.deepEqual(germanListingYahooSymbols("ABEA"), ["ABEA.DE", "ABEA.F", "ABEAD.XC"]);
    assert.ok(!germanListingYahooSymbols("ABEA").includes("ABE.F"));
    assert.ok(!germanListingYahooSymbols("ABEA").includes("ABE.DE"));
  });
});

describe("t212TickerToYahoo", () => {
  it("maps Xetra US names to German Yahoo symbols", () => {
    assert.equal(t212TickerToYahoo("MSFTd_EQ"), "MSF.DE");
    assert.equal(t212TickerToYahoo("AMZd_EQ"), "AMZ.DE");
    assert.equal(t212TickerToYahoo("FB2Ad_EQ"), "FB2A.DE");
    assert.equal(t212TickerToYahoo("FB2AD_EQ"), "FB2A.DE");
    assert.equal(t212TickerToYahoo("ABEAd_EQ"), "ABEA.DE");
    assert.equal(t212TickerToYahoo("ABEAD_EQ"), "ABEA.DE");
  });

  it("maps Amsterdam and London listings", () => {
    assert.equal(t212TickerToYahoo("ASMLa_EQ"), "ASML.AS");
    assert.equal(t212TickerToYahoo("BPl_EQ"), "BP.L");
  });

  it("keeps US tickers bare", () => {
    assert.equal(t212TickerToYahoo("AAPL_US_EQ"), "AAPL");
    assert.equal(t212TickerToYahoo("BRK_B_US_EQ"), "BRK-B");
  });

  it("does not remap US tickers ending in D to Xetra (GILD, CRWD, SCHD)", () => {
    assert.equal(t212TickerToYahoo("GILD_US_EQ"), "GILD");
    assert.equal(t212TickerToYahoo("CRWD_US_EQ"), "CRWD");
    assert.equal(t212TickerToYahoo("SCHD_US_EQ"), "SCHD");
    assert.deepEqual(parseT212Ticker("GILD_US_EQ"), {
      base: "GILD",
      yahooSuffix: null,
      isNonUsListing: false,
    });
    assert.deepEqual(parseT212Ticker("CRWD_US_EQ"), {
      base: "CRWD",
      yahooSuffix: null,
      isNonUsListing: false,
    });
    assert.deepEqual(parseT212Ticker("SCHD_US_EQ"), {
      base: "SCHD",
      yahooSuffix: null,
      isNonUsListing: false,
    });
  });
});

describe("t212QuoteCurrency", () => {
  it("uses USD for US listings even when wallet currency is EUR", () => {
    assert.equal(t212QuoteCurrency("META_US_EQ", "EUR"), "USD");
    assert.equal(t212QuoteCurrency("AAPL_US_EQ", "EUR"), "USD");
  });

  it("uses EUR for Xetra listings", () => {
    assert.equal(t212QuoteCurrency("FB2Ad_EQ", "EUR"), "EUR");
    assert.equal(t212QuoteCurrency("MSFTd_EQ", "EUR"), "EUR");
  });

  it("uses GBP for London listings", () => {
    assert.equal(t212QuoteCurrency("BPl_EQ", "GBP"), "GBP");
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

  it("does not include FB2.DE or METD for Xetra Meta", () => {
    const c = t212TickerToYahooCandidates("FB2Ad_EQ", "EUR");
    assert.equal(c[0], "FB2A.DE");
    assert.ok(!c.includes("FB2.DE"));
    assert.ok(!c.includes("METD"));
    assert.ok(!c.includes("FB2AD"));
  });

  it("does not include ABE.F trap for Xetra Alphabet Class A", () => {
    const c = t212TickerToYahooCandidates("ABEAd_EQ", "EUR");
    assert.equal(c[0], "ABEA.DE");
    assert.ok(!c.includes("ABE.F"));
    assert.ok(!c.includes("ABE.DE"));
    assert.ok(!c.includes("ABEAD"));
    const upper = t212TickerToYahooCandidates("ABEAD_EQ", "EUR");
    assert.equal(upper[0], "ABEA.DE");
    assert.ok(!upper.includes("ABE.F"));
  });
});
