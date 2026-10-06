import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computePayoutRatioPercent, sumQuarterlyDpsForFiscalYear } from "@/lib/payoutRatio";

describe("computePayoutRatioPercent", () => {
  it("uses DPS / EPS when both are usable", () => {
    assert.equal(computePayoutRatioPercent({ dps: 0.5, eps: 2 }), 25);
  });

  it("falls back to |dividends paid| / net income", () => {
    assert.equal(
      computePayoutRatioPercent({
        dps: null,
        eps: null,
        dividendsPaid: -40,
        netIncome: 200,
      }),
      20,
    );
  });

  it("returns null for non-payers and negative earnings", () => {
    assert.equal(computePayoutRatioPercent({ dps: 0, eps: 2 }), 0);
    assert.equal(computePayoutRatioPercent({ dps: null, eps: 2 }), null);
    assert.equal(
      computePayoutRatioPercent({ dps: 0.5, eps: -1, dividendsPaid: -10, netIncome: -50 }),
      null,
    );
    assert.equal(
      computePayoutRatioPercent({ dividendsPaid: -10, netIncome: 0 }),
      null,
    );
  });
});

describe("sumQuarterlyDpsForFiscalYear", () => {
  it("sums DPS in the matching calendar year", () => {
    const points = [
      { date: "2024-03-31", dividendPerShare: 0.2 },
      { date: "2024-06-30", dividendPerShare: 0.2 },
      { date: "2024-09-30", dividendPerShare: 0.25 },
      { date: "2024-12-31", dividendPerShare: 0.25 },
      { date: "2025-03-31", dividendPerShare: 0.3 },
    ];
    assert.equal(sumQuarterlyDpsForFiscalYear("2024", points), 0.9);
    assert.equal(sumQuarterlyDpsForFiscalYear("2025", points), 0.3);
    assert.equal(sumQuarterlyDpsForFiscalYear("2023", points), null);
  });
});
