import assert from "node:assert/strict";
import { it } from "node:test";
import { listedCompanyResults, mergeCompanyResults } from "./companySearch";
it("accepts real listed instruments and rejects names without valid instruments", () => {
  assert.deepEqual(
    listedCompanyResults([
      { symbol: "NEW", longname: "New listing", quoteType: "EQUITY" },
      { symbol: "NEW", shortname: "Duplicate", quoteType: "EQUITY" },
      { symbol: "PRIVATE", longname: "Private company" },
      { symbol: "<script>", longname: "Bad", quoteType: "EQUITY" },
      { symbol: "FUND", shortname: "Fund", quoteType: "ETF" },
    ]),
    [
      { s: "NEW", n: "New listing" },
      { s: "FUND", n: "Fund" },
    ],
  );
});
it("prefers fresh provider names without duplicate local tickers", () => {
  assert.deepEqual(
    mergeCompanyResults(
      [{ s: "NEW", n: "New listing" }],
      [
        { s: "NEW", n: "Old name" },
        { s: "DPZ", n: "Dominos" },
      ],
    ),
    [
      { s: "NEW", n: "New listing" },
      { s: "DPZ", n: "Dominos" },
    ],
  );
});
