import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  capGuruFocusGrowthRate,
  computeGuruFocusDcf,
  growthStageFactor,
  marginOfSafetyPct,
  terminalStageFactor,
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

  it("matches closed-form growth + terminal factors", () => {
    const r = computeGuruFocusDcf(baseInput);
    const x = (1 + 0.15) / (1 + 0.11);
    const y = (1 + 0.04) / (1 + 0.11);
    const growthFactor = growthStageFactor(x, 10);
    const terminalFactor = terminalStageFactor(x, y, 10, 10);

    assert.ok(Math.abs(r.growthValue - 6 * growthFactor) < 1e-6);
    assert.ok(Math.abs(r.terminalValue - 6 * terminalFactor) < 1e-6);
    assert.ok(Math.abs(r.intrinsicValue - r.growthValue - r.terminalValue) < 1e-6);
  });

  it("yearly PVs sum to intrinsic value", () => {
    const r = computeGuruFocusDcf(baseInput);
    const sumPv = r.yearlyProjections.reduce((s, p) => s + p.presentValue, 0);
    assert.ok(Math.abs(sumPv - r.intrinsicValue) < 1e-4);
  });

  it("adds tangible book to fair value", () => {
    const r = computeGuruFocusDcf({ ...baseInput, tangibleBookPerShare: 12.5 });
    assert.equal(r.fairValuePerShare, r.intrinsicValue + 12.5);
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
