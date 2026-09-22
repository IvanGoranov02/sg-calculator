import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  germanListingYahooSymbols,
  parseT212Ticker,
  t212ListingVenueLabel,
  t212QuoteCurrency,
  t212TickerToYahoo,
  t212TickerToYahooCandidates,
  usPrimarySymbolForLogo,
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

  it("parses uppercase Xetra stubs (FB2AD_EQ, METAD_EQ, ABEAD_EQ, UBERD_EQ)", () => {
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
    assert.deepEqual(parseT212Ticker("UBERD_EQ"), {
      base: "UBER",
      yahooSuffix: ".DE",
      isNonUsListing: true,
    });
  });

  it("parses Xetra Uber with lowercase exchange letter", () => {
    assert.deepEqual(parseT212Ticker("UBERd_EQ"), {
      base: "UBER",
      yahooSuffix: ".DE",
      isNonUsListing: true,
    });
  });

  it("parses local Xetra tickers for US companies (APC, TL0, NFC)", () => {
    assert.deepEqual(parseT212Ticker("APCd_EQ"), {
      base: "APC",
      yahooSuffix: ".DE",
      isNonUsListing: true,
    });
    assert.deepEqual(parseT212Ticker("TL0d_EQ"), {
      base: "TL0",
      yahooSuffix: ".DE",
      isNonUsListing: true,
    });
    assert.deepEqual(parseT212Ticker("NFCd_EQ"), {
      base: "NFC",
      yahooSuffix: ".DE",
      isNonUsListing: true,
    });
  });

  it("parses US ticker + Xetra letter (AAPLd_EQ, TSLAd_EQ, NFLXd_EQ)", () => {
    assert.deepEqual(parseT212Ticker("AAPLd_EQ"), {
      base: "AAPL",
      yahooSuffix: ".DE",
      isNonUsListing: true,
    });
    assert.deepEqual(parseT212Ticker("TSLAd_EQ"), {
      base: "TSLA",
      yahooSuffix: ".DE",
      isNonUsListing: true,
    });
    assert.deepEqual(parseT212Ticker("NFLXd_EQ"), {
      base: "NFLX",
      yahooSuffix: ".DE",
      isNonUsListing: true,
    });
  });

  it("parses uppercase Xetra stubs beyond the original allowlist (NFLXD_EQ, AAPLD_EQ)", () => {
    assert.deepEqual(parseT212Ticker("NFLXD_EQ"), {
      base: "NFLX",
      yahooSuffix: ".DE",
      isNonUsListing: true,
    });
    assert.deepEqual(parseT212Ticker("AAPLD_EQ"), {
      base: "AAPL",
      yahooSuffix: ".DE",
      isNonUsListing: true,
    });
  });

  it("parses extra EU country codes and exchange letters", () => {
    assert.deepEqual(parseT212Ticker("IBE_ES_EQ"), {
      base: "IBE",
      yahooSuffix: ".MC",
      isNonUsListing: true,
    });
    assert.deepEqual(parseT212Ticker("SANe_EQ"), {
      base: "SAN",
      yahooSuffix: ".MC",
      isNonUsListing: true,
    });
    assert.deepEqual(parseT212Ticker("ABIb_EQ"), {
      base: "ABI",
      yahooSuffix: ".BR",
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

  it("maps Uber to UBER.DE and avoids wrong UBE.DE truncation", () => {
    assert.deepEqual(germanListingYahooSymbols("UBER"), ["UBER.DE", "UBER.F"]);
    assert.ok(!germanListingYahooSymbols("UBER").includes("UBE.DE"));
    assert.ok(!germanListingYahooSymbols("UBER").includes("UBE.F"));
  });

  it("maps Apple/Tesla/Netflix US roots to Xetra local Yahoo symbols", () => {
    assert.deepEqual(germanListingYahooSymbols("AAPL"), ["APC.DE", "APC.F"]);
    assert.deepEqual(germanListingYahooSymbols("TSLA"), ["TL0.DE", "TL0.F"]);
    assert.deepEqual(germanListingYahooSymbols("NFLX"), ["NFC.DE", "NFC.F"]);
    assert.ok(!germanListingYahooSymbols("AAPL").includes("AAP.DE"));
    assert.ok(!germanListingYahooSymbols("TSLA").includes("TSL.DE"));
    assert.ok(!germanListingYahooSymbols("NFLX").includes("NFL.DE"));
  });
});

describe("t212TickerToYahoo", () => {
  it("maps Xetra US names to German Yahoo symbols", () => {
    assert.equal(t212TickerToYahoo("MSFTd_EQ"), "MSFT.DE");
    assert.equal(t212TickerToYahoo("AMZd_EQ"), "AMZ.DE");
    assert.equal(t212TickerToYahoo("FB2Ad_EQ"), "FB2A.DE");
    assert.equal(t212TickerToYahoo("FB2AD_EQ"), "FB2A.DE");
    assert.equal(t212TickerToYahoo("ABEAd_EQ"), "ABEA.DE");
    assert.equal(t212TickerToYahoo("ABEAD_EQ"), "ABEA.DE");
    assert.equal(t212TickerToYahoo("UBERd_EQ"), "UBER.DE");
    assert.equal(t212TickerToYahoo("UBERD_EQ"), "UBER.DE");
    assert.equal(t212TickerToYahoo("APCd_EQ"), "APC.DE");
    assert.equal(t212TickerToYahoo("AAPLd_EQ"), "APC.DE");
    assert.equal(t212TickerToYahoo("TL0d_EQ"), "TL0.DE");
    assert.equal(t212TickerToYahoo("TSLAd_EQ"), "TL0.DE");
    assert.equal(t212TickerToYahoo("NFCd_EQ"), "NFC.DE");
    assert.equal(t212TickerToYahoo("NFLXd_EQ"), "NFC.DE");
    assert.equal(t212TickerToYahoo("NFLXD_EQ"), "NFC.DE");
  });

  it("maps Amsterdam and London listings", () => {
    assert.equal(t212TickerToYahoo("ASMLa_EQ"), "ASML.AS");
    assert.equal(t212TickerToYahoo("BPl_EQ"), "BP.L");
  });

  it("keeps US tickers bare", () => {
    assert.equal(t212TickerToYahoo("AAPL_US_EQ"), "AAPL");
    assert.equal(t212TickerToYahoo("BRK_B_US_EQ"), "BRK-B");
    assert.equal(t212TickerToYahoo("UBER_US_EQ"), "UBER");
    assert.equal(t212TickerToYahoo("TSLA_US_EQ"), "TSLA");
    assert.equal(t212TickerToYahoo("NFLX_US_EQ"), "NFLX");
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
    assert.equal(t212QuoteCurrency("UBERd_EQ", "EUR"), "EUR");
    assert.equal(t212QuoteCurrency("AAPLd_EQ", "EUR"), "EUR");
    assert.equal(t212QuoteCurrency("SANe_EQ", "EUR"), "EUR");
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

  it("does not include UBE.DE trap for Xetra Uber", () => {
    const c = t212TickerToYahooCandidates("UBERd_EQ", "EUR");
    assert.equal(c[0], "UBER.DE");
    assert.ok(!c.includes("UBE.DE"));
    assert.ok(!c.includes("UBE.F"));
    assert.ok(!c.includes("UBERD"));
    const upper = t212TickerToYahooCandidates("UBERD_EQ", "EUR");
    assert.equal(upper[0], "UBER.DE");
    assert.ok(!upper.includes("UBE.DE"));
  });

  it("maps AAPL/TSLA/NFLX Xetra candidates to local codes not 3-char traps", () => {
    const aapl = t212TickerToYahooCandidates("AAPLd_EQ", "EUR");
    assert.equal(aapl[0], "APC.DE");
    assert.ok(!aapl.includes("AAP.DE"));
    const tsla = t212TickerToYahooCandidates("TSLAd_EQ", "EUR");
    assert.equal(tsla[0], "TL0.DE");
    assert.ok(!tsla.includes("TSL.DE"));
    const nflx = t212TickerToYahooCandidates("NFLXd_EQ", "EUR");
    assert.equal(nflx[0], "NFC.DE");
    assert.ok(!nflx.includes("NFL.DE"));
  });
});

describe("t212ListingVenueLabel", () => {
  it("labels Nasdaq vs Xetra listings", () => {
    assert.equal(t212ListingVenueLabel("AAPL_US_EQ"), "Nasdaq");
    assert.equal(t212ListingVenueLabel("UBERd_EQ"), "Xetra");
    assert.equal(t212ListingVenueLabel("BPl_EQ"), "LSE");
    assert.equal(t212ListingVenueLabel("SANe_EQ"), "Madrid");
  });
});

describe("usPrimarySymbolForLogo", () => {
  it("derives US primaries from German listing overrides", () => {
    assert.equal(usPrimarySymbolForLogo("APC"), "AAPL");
    assert.equal(usPrimarySymbolForLogo("MSF"), "MSFT");
    assert.equal(usPrimarySymbolForLogo("MSFTD"), "MSFT");
  });
});
