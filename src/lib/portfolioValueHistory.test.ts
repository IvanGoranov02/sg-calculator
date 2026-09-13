import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { QuoteHistoryBar } from "@/lib/dipFinder";
import {
  aggregateSnapshotsByMonth,
  buildPortfolioValueChartSeries,
  isValidMonthKey,
  monthEndCloseFromBars,
} from "@/lib/portfolioValueHistory";

describe("portfolioValueHistory", () => {
  it("validates month keys", () => {
    assert.equal(isValidMonthKey("2024-03"), true);
    assert.equal(isValidMonthKey("2024-13"), false);
    assert.equal(isValidMonthKey("bad"), false);
  });

  it("picks last snapshot per month", () => {
    const byMonth = aggregateSnapshotsByMonth(
      [
        { capturedAt: new Date("2024-03-10T12:00:00Z"), totalValue: 1000, currency: "USD" },
        { capturedAt: new Date("2024-03-20T12:00:00Z"), totalValue: 1100, currency: "USD" },
        { capturedAt: new Date("2024-04-01T12:00:00Z"), totalValue: 1200, currency: "USD" },
      ],
      "USD",
      { eurPerUsd: null, gbpPerUsd: null },
    );
    assert.equal(byMonth.get("2024-03"), 1100);
    assert.equal(byMonth.get("2024-04"), 1200);
  });

  it("uses month-end close from bars", () => {
    const bars: QuoteHistoryBar[] = [
      { date: "2024-03-01", close: 10 },
      { date: "2024-03-28", close: 12 },
      { date: "2024-04-02", close: 11 },
    ];
    assert.equal(monthEndCloseFromBars(bars, "2024-03"), 12);
    assert.equal(monthEndCloseFromBars(bars, "2024-02"), null);
  });

  it("manual overrides t212 for the same month", () => {
    const series = buildPortfolioValueChartSeries({
      snapshots: [
        { capturedAt: new Date("2024-03-15T12:00:00Z"), totalValue: 1000, currency: "USD" },
      ],
      manualRows: [{ month: "2024-03", amount: 5000, currency: "USD" }],
      holdings: [],
      historyBySymbol: {},
      fx: { eurPerUsd: null, gbpPerUsd: null },
      baseCurrency: "USD",
    });
    assert.equal(series.length, 1);
    assert.equal(series[0]!.value, 5000);
    assert.equal(series[0]!.source, "manual");
  });

  it("falls back to computed values when no t212 snapshot", () => {
    const series = buildPortfolioValueChartSeries({
      snapshots: [],
      manualRows: [],
      holdings: [{ symbolYahoo: "AAPL", quantity: 10, currency: "USD" }],
      historyBySymbol: {
        AAPL: [
          { date: "2024-01-30", close: 100 },
          { date: "2024-02-28", close: 110 },
        ],
      },
      fx: { eurPerUsd: null, gbpPerUsd: null },
      baseCurrency: "USD",
    });
    const jan = series.find((p) => p.month === "2024-01");
    const feb = series.find((p) => p.month === "2024-02");
    assert.equal(jan?.value, 1000);
    assert.equal(jan?.source, "computed");
    assert.equal(feb?.value, 1100);
    assert.equal(feb?.changePct, 10);
  });
});
