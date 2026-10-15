import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDcfSeed, epsGrowthFromHistory, fetchDcfSeed } from "@/lib/yahooDcfSeed";
import { yahooFinance } from "@/lib/yahooFinanceClient";

describe("EPS calculator seed", () => {
  it("uses major GBP prices with reporting GBP EPS", () => {
    const seed = buildDcfSeed("TEST.L", { quoteType: "EQUITY", currency: "GBp", financialCurrency: "GBP", regularMarketPrice: 150, epsTrailingTwelveMonths: 0.1 }, null, []);
    assert.equal(seed?.currency, "GBP");
    assert.equal(seed?.currentPrice, 1.5);
    assert.equal(seed?.epsPerShare, 0.1);
  });
  it("requires actual FX before mixing reporting EPS with another listing currency", () => {
    const raw = { quoteType: "EQUITY", currency: "EUR", financialCurrency: "USD", regularMarketPrice: 85, epsTrailingTwelveMonths: 4 };
    assert.equal(buildDcfSeed("TEST.DE", raw, null, []), null);
    assert.equal(buildDcfSeed("TEST.DE", raw, null, [], null), null);
    assert.equal(buildDcfSeed("TEST.DE", raw, null, [], 0.85)?.epsPerShare, 3.4);
  });
  it("uses elapsed years rather than number of rows for a history gap", () => {
    const growth = epsGrowthFromHistory([{ date: "2020-12-31", dilutedEPS: 1 }, { date: "2024-12-31", dilutedEPS: 2 }]);
    assert.ok(Math.abs(growth! - (2 ** 0.25 - 1)) < 0.001);
  });
  it("keeps a valid price and TTM EPS when optional history and summary fail", async (t) => {
    t.mock.method(yahooFinance, "quote", async () => ({ symbol: "TEST", quoteType: "EQUITY", currency: "USD", financialCurrency: "USD", regularMarketPrice: 100, epsTrailingTwelveMonths: 4 }));
    t.mock.method(yahooFinance, "quoteSummary", async () => { throw new Error("summary unavailable"); });
    const modules: string[] = [];
    t.mock.method(yahooFinance, "fundamentalsTimeSeries", async (_symbol: string, options: { module: string }) => { modules.push(options.module); throw new Error("history unavailable"); });
    const seed = await fetchDcfSeed("TEST");
    assert.equal(seed?.epsPerShare, 4);
    assert.equal(seed?.currentPrice, 100);
    assert.deepEqual(modules, ["financials"]);
  });
  it("loads the required reporting-to-listing FX pair", async (t) => {
    const calls: string[] = [];
    t.mock.method(yahooFinance, "quote", async (symbol: string) => { calls.push(symbol); return symbol === "USDEUR=X"
      ? { regularMarketPrice: 0.85 } : { symbol, quoteType: "EQUITY", currency: "EUR", financialCurrency: "USD", regularMarketPrice: 85, epsTrailingTwelveMonths: 4 }; });
    t.mock.method(yahooFinance, "quoteSummary", async () => null);
    t.mock.method(yahooFinance, "fundamentalsTimeSeries", async () => []);
    const seed = await fetchDcfSeed("TEST.DE");
    assert.equal(seed?.epsPerShare, 3.4);
    assert.deepEqual(calls, ["TEST.DE", "USDEUR=X"]);
  });
});
