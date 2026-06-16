import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeValuationVerdict, type ValuationInputs } from "@/lib/valuationVerdict";

const base: ValuationInputs = {
  price: 100,
  baseFcf: 1_000_000_000,
  netDebt: 0,
  sharesOutstanding: 100_000_000, // FCF/share = $10
  trailingEps: 5,
  avgHistoricalPe: 20, // multiples fair value = 100
  growthRate: 0.08,
  wacc: 0.09,
  terminalGrowth: 0.025,
};

describe("computeValuationVerdict", () => {
  it("produces a fair-value range from both methods", () => {
    const r = computeValuationVerdict(base);
    assert.ok(r.fairValueLow != null && r.fairValueHigh != null);
    assert.ok((r.fairValueLow as number) <= (r.fairValueMid as number));
    assert.ok((r.fairValueMid as number) <= (r.fairValueHigh as number));
    // multiples method = 5 * 20 = 100
    assert.ok(r.methods.find((m) => m.key === "multiples")?.fairValue === 100);
  });

  it("flags undervalued when estimate is well above price", () => {
    const r = computeValuationVerdict({ ...base, price: 50 });
    assert.equal(r.verdict, "undervalued");
    assert.ok((r.discountPct as number) > 15);
  });

  it("flags overvalued when price is well above estimate", () => {
    const r = computeValuationVerdict({ ...base, price: 500 });
    assert.equal(r.verdict, "overvalued");
    assert.ok((r.discountPct as number) < -15);
  });

  it("clamps a silly historical P/E", () => {
    const r = computeValuationVerdict({ ...base, avgHistoricalPe: 999 });
    // multiples = 5 * clamp(999 -> 45) = 225
    assert.equal(r.methods.find((m) => m.key === "multiples")?.fairValue, 225);
  });

  it("reverse DCF: higher price implies higher growth", () => {
    const low = computeValuationVerdict({ ...base, price: 80 }).impliedGrowthPct;
    const high = computeValuationVerdict({ ...base, price: 200 }).impliedGrowthPct;
    assert.ok(low != null && high != null);
    assert.ok((high as number) > (low as number));
  });

  it("skips DCF when FCF is non-positive but still uses multiples", () => {
    const r = computeValuationVerdict({ ...base, baseFcf: -5 });
    assert.equal(r.methods.find((m) => m.key === "dcf")?.fairValue, null);
    assert.ok(r.fairValueMid != null); // multiples still works
    assert.equal(r.impliedGrowthPct, null);
  });

  it("returns unknown when nothing can be computed", () => {
    const r = computeValuationVerdict({ ...base, baseFcf: -5, trailingEps: -1 });
    assert.equal(r.verdict, "unknown");
    assert.equal(r.fairValueMid, null);
  });
});
