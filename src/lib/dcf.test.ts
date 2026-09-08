import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  capGuruFocusGrowthRate,
  cagrFromAnnualWindow,
  computeGuruFocusDcf,
  marginOfSafetyPct,
  validateGuruFocusDcfInputs,
} from "@/lib/dcf";

describe("computeGuruFocusDcf", () => {
  const baseInput = {
    basePerShare: 6,
    discountRate: 0.11,
    growthYears: 10,
    growthRate: 0.15,
    terminalYears: 10,
    terminalGrowthRate: 0.04,
    tangibleBookPerShare: 0,
  };

  it("pins GuruFocus spot-check values for the standard case", () => {
    const r = computeGuruFocusDcf(baseInput);
    assert.ok(Math.abs(r.growthValue - 73.275) < 0.01);
    assert.ok(Math.abs(r.terminalValue - 60.797) < 0.01);
    assert.ok(Math.abs(r.intrinsicValue - 134.072) < 0.01);
    assert.ok(Math.abs(r.fairValuePerShare - 134.072) < 0.01);
  });

  it("yearly PVs sum to intrinsic value", () => {
    const r = computeGuruFocusDcf(baseInput);
    const sumPv = r.yearlyProjections.reduce((s, p) => s + p.presentValue, 0);
    assert.ok(Math.abs(sumPv - r.intrinsicValue) < 1e-4);
  });

  it("adds tangible book to fair value", () => {
    const r = computeGuruFocusDcf({ ...baseInput, tangibleBookPerShare: 12.5 });
    assert.ok(Math.abs(r.fairValuePerShare - (134.072 + 12.5)) < 0.02);
  });

  it("handles x ≈ 1 (growth rate equals discount rate)", () => {
    const r = computeGuruFocusDcf({
      ...baseInput,
      growthRate: 0.11,
      growthYears: 5,
      terminalYears: 3,
    });
    assert.ok(r.intrinsicValue > 0);
    assert.equal(r.yearlyProjections.length, 8);
  });

  it("rejects terminal growth >= discount rate", () => {
    assert.throws(() =>
      computeGuruFocusDcf({ ...baseInput, terminalGrowthRate: 0.11 }),
    );
  });
});

describe("cagrFromAnnualWindow", () => {
  it("uses full window span including loss years between endpoints", () => {
    const rate = cagrFromAnnualWindow([2, -1, 0.5, 1, 4]);
    assert.ok(rate != null);
    assert.ok(Math.abs(rate - (Math.pow(4 / 2, 1 / 4) - 1)) < 1e-9);
  });

  it("returns null when an endpoint is non-positive", () => {
    assert.equal(cagrFromAnnualWindow([-1, 1, 2, 3]), null);
    assert.equal(cagrFromAnnualWindow([1, 2, -3]), null);
  });
});

describe("validateGuruFocusDcfInputs", () => {
  it("flags terminal growth at or above discount", () => {
    assert.equal(
      validateGuruFocusDcfInputs({
        basePerShare: 6,
        discountPct: 11,
        growthYears: 10,
        terminalYears: 10,
        terminalGrowthPct: 11,
      }),
      "terminal_growth_vs_discount",
    );
  });

  it("flags missing discount", () => {
    assert.equal(
      validateGuruFocusDcfInputs({
        basePerShare: 6,
        discountPct: Number.NaN,
        growthYears: 10,
        terminalYears: 10,
        terminalGrowthPct: 4,
      }),
      "discount_required",
    );
  });
});

describe("marginOfSafetyPct", () => {
  it("returns positive MOS when fair value exceeds price", () => {
    const mos = marginOfSafetyPct(100, 80);
    assert.equal(mos, 20);
  });

  it("returns null for invalid inputs", () => {
    assert.equal(marginOfSafetyPct(0, 10), null);
    assert.equal(marginOfSafetyPct(100, 0), null);
  });
});

describe("capGuruFocusGrowthRate", () => {
  it("clamps between 5% and 20%", () => {
    assert.equal(capGuruFocusGrowthRate(0.01), 0.05);
    assert.equal(capGuruFocusGrowthRate(0.25), 0.2);
    assert.equal(capGuruFocusGrowthRate(0.12), 0.12);
  });
});
