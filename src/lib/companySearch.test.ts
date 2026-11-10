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

import { searchCurrentCompanies } from "./companySearchServer";
import { secListedCompanies } from "./companySearch";
it("maps SEC class-share tickers to selectable Yahoo instruments", () => {
  assert.deepEqual(
    secListedCompanies({
      a: { ticker: "BRK.B", title: "Berkshire" },
      b: { ticker: "<bad>", title: "Bad" },
    }),
    [{ s: "BRK-B", n: "Berkshire" }],
  );
});
it("uses public search without a quote authentication request", async () => {
  const requests: string[] = [];
  const fake: typeof fetch = async (input) => {
    requests.push(String(input));
    return Response.json({
      quotes: [
        { symbol: "NEW", shortname: "Newly listed", quoteType: "EQUITY" },
      ],
    });
  };
  const result = await searchCurrentCompanies("Newly listed", fake);
  assert.deepEqual(result.companies, [{ s: "NEW", n: "Newly listed" }]);
  assert.equal(requests.length, 1);
  assert(requests[0].includes("/v1/finance/search?"));
});
it("keeps finding new listings through SEC when both Yahoo hosts fail", async () => {
  const fake: typeof fetch = async (input) =>
    String(input).includes("sec.gov")
      ? Response.json({ 0: { ticker: "NEW", title: "Newly listed company" } })
      : new Response("Rate limited", { status: 429 });
  const result = await searchCurrentCompanies("Newly listed", fake);
  assert.equal(result.source, "sec");
  assert.deepEqual(result.companies, [{ s: "NEW", n: "Newly listed company" }]);
});
