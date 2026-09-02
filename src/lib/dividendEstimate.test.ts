import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { periodizeAnnualDividend } from "@/lib/dividendEstimate";

describe("periodizeAnnualDividend", () => {
  it("splits annual into month (/12) and day (/365)", () => {
    const r = periodizeAnnualDividend(1200)!;
    assert.equal(r.annual, 1200);
    assert.equal(r.month, 100);
    assert.ok(Math.abs(r.day - 1200 / 365) < 1e-12);
  });

  it("keeps a zero estimate as zeros", () => {
    const r = periodizeAnnualDividend(0)!;
    assert.equal(r.annual, 0);
    assert.equal(r.month, 0);
    assert.equal(r.day, 0);
  });

  it("returns null for non-finite or negative input", () => {
    assert.equal(periodizeAnnualDividend(Number.NaN), null);
    assert.equal(periodizeAnnualDividend(Number.POSITIVE_INFINITY), null);
    assert.equal(periodizeAnnualDividend(-1), null);
  });
});
