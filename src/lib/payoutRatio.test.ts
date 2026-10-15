import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computePayoutRatioPercent,
  computeTrailingPayoutRatios,
  dividendSeriesInOneCurrency,
  sumQuarterlyDpsForFiscalYear,
} from "@/lib/payoutRatio";

describe("dividendSeriesInOneCurrency", () => {
  const points = [
    { date: "2025-03-31", dividendPerShare: 0.5 },
    { date: "2025-06-30", dividendPerShare: 0.6 },
  ];
  it("retains the actual reporting currency when all dividends are reporting-currency data", () => {
    const series = dividendSeriesInOneCurrency(points, { fundamentalsCurrency: "EUR", quoteCurrency: "USD" });
    assert.equal(series.currency, "EUR");
    assert.equal(series.points[0]?.dividendPerShare, 0.5);
  });
  it("keeps listing cash labeled USD and gaps reporting-currency rows when FX failed", () => {
    const series = dividendSeriesInOneCurrency(points, {
      fundamentalsCurrency: "EUR", quoteCurrency: "USD", listingDates: ["2025-06-30"],
    });
    assert.equal(series.currency, "USD");
    assert.equal(series.points[0]?.dividendPerShare, null);
    assert.equal(series.points[1]?.dividendPerShare, 0.6);
  });
  it("keeps both rows after reporting fundamentals and dividends have been reconciled", () => {
    const series = dividendSeriesInOneCurrency(points, {
      fundamentalsCurrency: "USD", quoteCurrency: "USD", listingDates: ["2025-06-30"],
    });
    assert.deepEqual(series.points, points);
  });
});

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

  it("returns null for non-payers, zero/negative earnings, and non-finite inputs", () => {
    assert.equal(computePayoutRatioPercent({ dps: 0, eps: 2 }), 0);
    assert.equal(computePayoutRatioPercent({ dps: null, eps: 2 }), null);
    assert.equal(
      computePayoutRatioPercent({ dps: 0.5, eps: -1, dividendsPaid: -10, netIncome: -50 }),
      null,
    );
    assert.equal(computePayoutRatioPercent({ dps: 0.5, eps: 0 }), null);
    assert.equal(computePayoutRatioPercent({ dividendsPaid: -10, netIncome: 0 }), null);
    assert.equal(computePayoutRatioPercent({ dps: Number.NaN, eps: 2 }), null);
    assert.equal(computePayoutRatioPercent({ dps: 1, eps: Number.POSITIVE_INFINITY }), null);
    assert.equal(computePayoutRatioPercent({ dividendsPaid: Number.NaN, netIncome: 10 }), null);
  });
});

describe("computeTrailingPayoutRatios", () => {
  it("needs a full 4Q window and uses TTM DPS/EPS", () => {
    const points = [
      { dps: 0.25, eps: 1 },
      { dps: 0.25, eps: 1 },
      { dps: 0.25, eps: 1 },
      { dps: 0.25, eps: 1 },
      { dps: 0.5, eps: 1 },
    ];
    const out = computeTrailingPayoutRatios(points, 4);
    assert.equal(out[0], null);
    assert.equal(out[1], null);
    assert.equal(out[2], null);
    assert.equal(out[3], 25); // 1/4
    assert.equal(out[4], 31.25); // 1.25/4
  });

  it("returns null when trailing EPS sums to ≤ 0", () => {
    const points = [
      { dps: 0.2, eps: 1 },
      { dps: 0.2, eps: 1 },
      { dps: 0.2, eps: -3 },
      { dps: 0.2, eps: 0.5 },
    ];
    const out = computeTrailingPayoutRatios(points, 4);
    assert.equal(out[3], null);
  });

  it("falls back to trailing cash dividends / NI", () => {
    const points = [
      { dividendsPaid: -10, netIncome: 40 },
      { dividendsPaid: -10, netIncome: 40 },
      { dividendsPaid: -10, netIncome: 40 },
      { dividendsPaid: -10, netIncome: 40 },
    ];
    const out = computeTrailingPayoutRatios(points, 4);
    assert.equal(out[3], 25);
  });

  it("does not compare four quarters of dividends with only one quarter of EPS", () => {
    const points = [{ dps: 1, eps: 2 }, { dps: 1 }, { dps: 1 }, { dps: 1 }];
    assert.equal(computeTrailingPayoutRatios(points)[3], null);
  });

  it("requires a complete dividend numerator and cash fallback", () => {
    assert.equal(computeTrailingPayoutRatios([
      { dps: 1, eps: 2 }, { eps: 2 }, { eps: 2 }, { eps: 2 },
    ])[3], null);
    assert.equal(computeTrailingPayoutRatios([
      { dividendsPaid: -10, netIncome: 40 }, { netIncome: 40 },
      { netIncome: 40 }, { netIncome: 40 },
    ])[3], null);
  });

  it("uses a complete cash fallback when per-share data is incomplete", () => {
    const points = Array.from({ length: 4 }, () => ({ dps: 1, dividendsPaid: -10, netIncome: 40 }));
    assert.equal(computeTrailingPayoutRatios(points)[3], 25);
  });

  it("does not treat a gap of a missing quarter as a TTM series", () => {
    const points = ["2024-03-31", "2024-06-30", "2024-12-31", "2025-03-31"]
      .map((date) => ({ date, dps: 1, eps: 2 }));
    assert.equal(computeTrailingPayoutRatios(points)[3], null);
    assert.deepEqual(computeTrailingPayoutRatios(points, 2.5), [null, null, null, null]);
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
    assert.equal(sumQuarterlyDpsForFiscalYear("2024", points, "2024-12-31"), 0.9);
    assert.equal(sumQuarterlyDpsForFiscalYear("2025", points, "2025-12-31"), null);
    assert.equal(sumQuarterlyDpsForFiscalYear("2023", points, "2023-12-31"), null);
  });

  it("sums dividends from the same June fiscal period as EPS", () => {
    const points: Array<{ date: string; dividendPerShare: number | null }> = [
      { date: "2024-06-30", dividendPerShare: 9 },
      { date: "2024-09-30", dividendPerShare: 0.2 },
      { date: "2024-12-31", dividendPerShare: 0.2 },
      { date: "2025-03-31", dividendPerShare: 0.3 },
      { date: "2025-06-30", dividendPerShare: 0.3 },
      { date: "2025-09-30", dividendPerShare: 9 },
    ];
    assert.equal(sumQuarterlyDpsForFiscalYear("2025", points, "2025-06-30", "2024-06-30"), 1);
    points[2].dividendPerShare = null;
    assert.equal(sumQuarterlyDpsForFiscalYear("2025", points, "2025-06-30", "2024-06-30"), null);
  });

  it("includes the first quarter of a 53-week fiscal year using the reported prior end", () => {
    const points = ["2023-12-30", "2024-03-30", "2024-06-29", "2024-09-28"]
      .map((date) => ({ date, dividendPerShare: 0.25 }));
    assert.equal(sumQuarterlyDpsForFiscalYear("2024", points, "2024-09-28", "2023-09-30"), 1);
  });
});
