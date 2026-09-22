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
    assert.equal(fmpLogoSymbol("INL.DE"), "INTC");
    assert.equal(fmpLogoSymbol("2PP.DE"), "PYPL");
    assert.equal(fmpLogoSymbol("CCC3"), "KO");
  });

  it("does not rewrite US tickers that end in D", () => {
    assert.equal(fmpLogoSymbol("GILD"), "GILD");
    assert.equal(fmpLogoSymbol("CRWD"), "CRWD");
    assert.equal(fmpLogoSymbol("SCHD"), "SCHD");
    assert.equal(fmpLogoSymbol("KOD"), "KOD");
  });
});
