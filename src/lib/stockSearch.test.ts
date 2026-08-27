import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classShareYahooTicker,
  resolveStockSearchQuery,
  suggestCompanies,
} from "@/lib/stockSearch";

const companies = [
  { s: "AAPL", n: "Apple Inc." },
  { s: "BRK-B", n: "BERKSHIRE HATHAWAY INC" },
  { s: "SAP", n: "SAP SE" },
  { s: "NVDA", n: "NVIDIA CORP" },
];

describe("classShareYahooTicker", () => {
  it("maps a dotted share class to Yahoo hyphen form", () => {
    assert.equal(classShareYahooTicker("BRK.B"), "BRK-B");
    assert.equal(classShareYahooTicker("bf.b"), "BF-B");
  });

  it("leaves normal tickers and exchange suffixes alone", () => {
    assert.equal(classShareYahooTicker("AAPL"), "AAPL");
    assert.equal(classShareYahooTicker("SAP.DE"), "SAP.DE");
  });
});

describe("suggestCompanies", () => {
  it("ranks ticker prefix above name matches", () => {
    const r = suggestCompanies(companies, "AAP");
    assert.equal(r[0]?.s, "AAPL");
  });

  it("matches company names and dotted class-share tickers", () => {
    const byName = suggestCompanies(companies, "APPLE");
    assert.equal(byName[0]?.s, "AAPL");
    const byDot = suggestCompanies(companies, "BRK.B");
    assert.equal(byDot[0]?.s, "BRK-B");
  });

  it("returns nothing for an empty query", () => {
    assert.deepEqual(suggestCompanies(companies, "  "), []);
  });
});

describe("resolveStockSearchQuery", () => {
  it("uses an exact ticker in the index", () => {
    assert.equal(resolveStockSearchQuery("aapl", [], companies), "AAPL");
  });

  it("maps BRK.B to BRK-B", () => {
    assert.equal(resolveStockSearchQuery("BRK.B", [], companies), "BRK-B");
  });

  it("uses the top suggestion when the query is a company name", () => {
    const sug = suggestCompanies(companies, "APPLE INC");
    assert.equal(resolveStockSearchQuery("APPLE INC", sug, companies), "AAPL");
  });

  it("passes through a valid ticker not in the US index (non-US)", () => {
    assert.equal(resolveStockSearchQuery("SAP.DE", [], companies), "SAP.DE");
  });

  it("returns null on empty input", () => {
    assert.equal(resolveStockSearchQuery("  ", [], companies), null);
  });
});
