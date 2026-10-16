import assert from "node:assert/strict";
import { it } from "node:test";
import { computePortfolioAnalytics, type AnalyticsRow } from "./portfolioAnalytics";

it("excludes missing and unconvertible values from cost and P/L and warns", () => {
  const row = (symbol: string, mv: number | null, cost: number, holdingCcy = "USD"): AnalyticsRow => ({
    symbol, mv, cost, holdingCcy, pl: mv == null ? null : mv - cost,
    name: null, sector: null, estAnnual: null, dayChangePct: null,
  });
  const result = computePortfolioAnalytics([
    row("AAPL", 120, 100), row("MISSING", null, 500), row("NOFX", 200, 300, "EUR"),
  ], { eurPerUsd: null, gbpPerUsd: null }, "USD", "Unknown");
  assert.equal(result.totalValue, 120);
  assert.equal(result.totalCost, 100);
  assert.equal(result.totalPl, 20);
  assert.equal(result.totalPlPct, 20);
  assert.equal(result.unconverted, 2);
  assert.deepEqual(result.best.map(h => h.symbol), ["AAPL"]);
  assert.deepEqual(result.holdings.map(h => h.symbol), ["AAPL"]);
});
