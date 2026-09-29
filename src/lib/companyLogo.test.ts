import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { companyLogoUrl, fmpLogoSymbol } from "@/lib/companyLogo";

describe("companyLogo", () => {
  it("strips exchange suffix for FMP lookup", () => {
    assert.equal(fmpLogoSymbol("VOW3.DE"), "VOW3");
    assert.equal(fmpLogoSymbol("aapl"), "AAPL");
  });

  it("builds FMP image URL", () => {
    assert.equal(
      companyLogoUrl("BRK-B"),
      "https://financialmodelingprep.com/image-stock/BRK-B.png",
    );
  });

  it("maps EU-listed Meta tickers to META for logo lookup", () => {
    assert.equal(fmpLogoSymbol("FB2AD"), "META");
    assert.equal(fmpLogoSymbol("FB2AD-EQ"), "META");
    assert.equal(fmpLogoSymbol("FB2AD_EQ"), "META");
    assert.equal(fmpLogoSymbol("FB2A.DE"), "META");
    assert.equal(fmpLogoSymbol("METAD"), "META");
    assert.equal(
      companyLogoUrl("FB2AD"),
      "https://financialmodelingprep.com/image-stock/META.png",
    );
  });

  it("maps other EU-listed US tickers to US primary symbols", () => {
    assert.equal(fmpLogoSymbol("ABEAD"), "GOOGL");
    assert.equal(fmpLogoSymbol("ABEA.DE"), "GOOGL");
    assert.equal(fmpLogoSymbol("ABEC"), "GOOG");
    assert.equal(fmpLogoSymbol("AMZD"), "AMZN");
    assert.equal(fmpLogoSymbol("AMZ.DE"), "AMZN");
    assert.equal(fmpLogoSymbol("MSFTD"), "MSFT");
    assert.equal(fmpLogoSymbol("MSF.DE"), "MSFT");
    assert.equal(fmpLogoSymbol("UBERD"), "UBER");
    assert.equal(fmpLogoSymbol("UBER.DE"), "UBER");
    assert.equal(fmpLogoSymbol("UBERd_EQ"), "UBER");
    assert.equal(fmpLogoSymbol("UBERD_EQ"), "UBER");
  });

  it("maps local Xetra codes for major US names", () => {
    assert.equal(fmpLogoSymbol("APC"), "AAPL");
    assert.equal(fmpLogoSymbol("APC.DE"), "AAPL");
    assert.equal(fmpLogoSymbol("AAPLD"), "AAPL");
    assert.equal(fmpLogoSymbol("TL0"), "TSLA");
    assert.equal(fmpLogoSymbol("TL0.DE"), "TSLA");
    assert.equal(fmpLogoSymbol("TSLAD"), "TSLA");
    assert.equal(fmpLogoSymbol("NFC"), "NFLX");
    assert.equal(fmpLogoSymbol("NFC.DE"), "NFLX");
    assert.equal(fmpLogoSymbol("NFLXD"), "NFLX");
    assert.equal(fmpLogoSymbol("NFCd_EQ"), "NFLX");
    assert.equal(fmpLogoSymbol("NFLXd_EQ"), "NFLX");
    assert.equal(fmpLogoSymbol("NFCD"), "NFLX");
    assert.equal(fmpLogoSymbol("INL.DE"), "INTC");
    assert.equal(fmpLogoSymbol("2PP.DE"), "PYPL");
    assert.equal(fmpLogoSymbol("CCC3"), "KO");
  });

  it("does not rewrite US tickers that end in D", () => {
    assert.equal(fmpLogoSymbol("GILD"), "GILD");
    assert.equal(fmpLogoSymbol("CRWD"), "CRWD");
    assert.equal(fmpLogoSymbol("SCHD"), "SCHD");
    assert.equal(fmpLogoSymbol("KOD"), "KOD");
    assert.equal(fmpLogoSymbol("GOOD"), "GOOD");
  });

  it("does not map truncated Alphabet trap ABE to GOOGL", () => {
    assert.equal(fmpLogoSymbol("ABE.DE"), "ABE");
    assert.equal(fmpLogoSymbol("ABE.F"), "ABE");
    assert.equal(fmpLogoSymbol("ABE"), "ABE");
  });

  it("does not remap bare US tickers that collide with wrong 3-char Yahoo truncations", () => {
    assert.equal(fmpLogoSymbol("AAP"), "AAP");
    assert.equal(fmpLogoSymbol("AAP_US_EQ"), "AAP");
    assert.equal(fmpLogoSymbol("INT"), "INT");
    assert.equal(fmpLogoSymbol("TSL"), "TSL");
    assert.equal(fmpLogoSymbol("GOO.DE"), "GOO");
  });

  it("maps the Xetra universe of US listings, not a handful of names", () => {
    assert.equal(fmpLogoSymbol("NVD.DE"), "NVDA");
    assert.equal(fmpLogoSymbol("NVDd_EQ"), "NVDA");
    assert.equal(fmpLogoSymbol("NVDD"), "NVDD");
    assert.equal(fmpLogoSymbol("GS2C.DE"), "GME");
    assert.equal(fmpLogoSymbol("GS2Cd_EQ"), "GME");
    assert.equal(fmpLogoSymbol("WDP.DE"), "DIS");
    assert.equal(fmpLogoSymbol("WDPd_EQ"), "DIS");
    assert.equal(fmpLogoSymbol("UT8.DE"), "UBER");
    assert.equal(fmpLogoSymbol("UT8d_EQ"), "UBER");
    assert.equal(fmpLogoSymbol("1SI.DE"), "SNAP");
    assert.equal(fmpLogoSymbol("4S0.DE"), "NOW");
    assert.equal(fmpLogoSymbol("ORC.DE"), "ORCL");
    assert.equal(fmpLogoSymbol("CMC.DE"), "JPM");
    assert.equal(fmpLogoSymbol("CTO.F"), "COST");
    assert.equal(fmpLogoSymbol("BRYN.DE"), "BRK-B");
    assert.equal(
      companyLogoUrl("GS2Cd_EQ"),
      "https://financialmodelingprep.com/image-stock/GME.png",
    );
  });

  it("resolves the Portfolio screenshot holdings to real FMP logos", () => {
    // Trading 212 EUR book: local Xetra codes that 404 on FMP must use the US ticker.
    assert.equal(fmpLogoSymbol("ASML.AS"), "ASML");
    assert.equal(fmpLogoSymbol("AMZ.DE"), "AMZN");
    assert.equal(fmpLogoSymbol("FB2A.DE"), "META");
    assert.equal(fmpLogoSymbol("ABEA.DE"), "GOOGL");
    assert.equal(fmpLogoSymbol("NFC.DE"), "NFLX");
    assert.equal(fmpLogoSymbol("M4I.DE"), "MA");
    assert.equal(fmpLogoSymbol("M4Id_EQ"), "MA");
    assert.equal(fmpLogoSymbol("UNH.DE"), "UNH");
    assert.equal(fmpLogoSymbol("MSF.DE"), "MSFT");
    assert.equal(fmpLogoSymbol("UT8.DE"), "UBER");
    assert.equal(fmpLogoSymbol("UT8d_EQ"), "UBER");
    assert.equal(fmpLogoSymbol("87Q.DE"), "DUOL");
    assert.equal(fmpLogoSymbol("87Qd_EQ"), "DUOL");
    assert.equal(fmpLogoSymbol("DUOL.L"), "DUOL");
    assert.equal(
      companyLogoUrl("UT8.DE"),
      "https://financialmodelingprep.com/image-stock/UBER.png",
    );
    assert.equal(
      companyLogoUrl("M4I.DE"),
      "https://financialmodelingprep.com/image-stock/MA.png",
    );
  });

  it("maps the same ISIN and non-German EU venue symbols to the US ticker", () => {
    assert.equal(fmpLogoSymbol("US0378331005"), "AAPL");
    assert.equal(fmpLogoSymbol("US67066G1040"), "NVDA");
    assert.equal(fmpLogoSymbol("0R2V.L"), "AAPL");
    assert.equal(fmpLogoSymbol("1AAPL.MI"), "AAPL");
  });

  it("keeps US tickers when a German mnemonic collides, and remaps the German line", () => {
    assert.equal(fmpLogoSymbol("GIS"), "GIS");
    assert.equal(fmpLogoSymbol("GIS_US_EQ"), "GIS");
    assert.equal(fmpLogoSymbol("GIS.DE"), "GILD");
    assert.equal(fmpLogoSymbol("GISd_EQ"), "GILD");
    assert.equal(fmpLogoSymbol("BAC"), "BAC");
    assert.equal(fmpLogoSymbol("BAC_US_EQ"), "BAC");
    assert.equal(fmpLogoSymbol("BAC.DE"), "VZ");
    assert.equal(fmpLogoSymbol("BACd_EQ"), "VZ");
    assert.equal(fmpLogoSymbol("SNOW"), "SNOW");
    assert.equal(fmpLogoSymbol("SNOW.DE"), "SNOW");
    assert.equal(fmpLogoSymbol("BOX"), "BOX");
    assert.equal(fmpLogoSymbol("BOX.DE"), "BDX");
    assert.equal(fmpLogoSymbol("PRLD"), "PRLD");
  });

  it("does not rewrite bare US ETFs and tickers that already have FMP logos", () => {
    assert.equal(fmpLogoSymbol("EWG"), "EWG");
    assert.equal(fmpLogoSymbol("EWL"), "EWL");
    assert.equal(fmpLogoSymbol("EDC"), "EDC");
    assert.equal(fmpLogoSymbol("FAS"), "FAS");
    assert.equal(fmpLogoSymbol("FB"), "FB");
    assert.equal(fmpLogoSymbol("FRI"), "FRI");
    assert.equal(fmpLogoSymbol("NVD"), "NVD");
    assert.equal(fmpLogoSymbol("NVDD"), "NVDD");
    assert.equal(fmpLogoSymbol("RWL"), "RWL");
    assert.equal(fmpLogoSymbol("XPH"), "XPH");
    assert.equal(fmpLogoSymbol("EWG_US_EQ"), "EWG");
    assert.equal(fmpLogoSymbol("FAS_US_EQ"), "FAS");
    assert.equal(fmpLogoSymbol("FB_US_EQ"), "FB");
  });

  it("maps WDP to Disney only on Xetra, not on Euronext", () => {
    assert.equal(fmpLogoSymbol("WDP.DE"), "DIS");
    assert.equal(fmpLogoSymbol("WDPd_EQ"), "DIS");
    assert.equal(fmpLogoSymbol("WDP"), "WDP");
    assert.equal(fmpLogoSymbol("WDP.BR"), "WDP");
    assert.equal(fmpLogoSymbol("WDP.AS"), "WDP");
    assert.equal(fmpLogoSymbol("WDPb_EQ"), "WDP");
  });
});
