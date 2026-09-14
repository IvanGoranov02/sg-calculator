import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allocationPercentOfTotal,
  formatAllocationPercent,
} from "@/lib/portfolioAllocation";

describe("portfolioAllocation", () => {
  it("computes share of total portfolio value", () => {
    assert.equal(allocationPercentOfTotal(1000, 250), 25);
    assert.equal(allocationPercentOfTotal(1000, 1000), 100);
    assert.equal(allocationPercentOfTotal(0, 100), 0);
  });

  it("formats allocation percentages without decimals", () => {
    assert.equal(formatAllocationPercent(25.4), "25%");
    assert.equal(formatAllocationPercent(0.6), "1%");
  });
});
