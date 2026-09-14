import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { QuoteHistoryBar } from "@/lib/dipFinder";
import {
  aggregateSnapshotsByMonth,
  buildPortfolioValueChartSeries,
  calendarMonthsForEvents,
  computeLiveHoldingsValue,
  computeMonthlyValuesFromHoldings,
  isValidMonthKey,
  isYahooPenceHistory,
  listingPriceCurrency,
  monthEndCloseFromBars,
  monthKeyFromDate,
  monthKeyFromIsoDate,
  monthKeyFromParts,
  parseChartBaseCurrency,
  parseMonthKey,
  prepareHistoryBarsForValue,
  pickPortfolioHistorySymbols,
  quantitiesByMonthFromEvents,
  quantityTimelineMatchesHoldings,
} from "@/lib/portfolioValueHistory";

const fx = { eurPerUsd: 0.92, gbpPerUsd: 0.79 };

describe("portfolioValueHistory month keys", () => {
  it("validates month keys", () => {
    assert.equal(isValidMonthKey("2024-03"), true);
    assert.equal(isValidMonthKey("2024-13"), false);
    assert.equal(isValidMonthKey("bad"), false);
  });

  it("buckets snapshots by UTC calendar month, not the next local day", () => {
    assert.equal(monthKeyFromDate(new Date("2026-03-31T23:30:00Z")), "2026-03");
    assert.equal(monthKeyFromDate(new Date("2026-04-01T00:00:00Z")), "2026-04");
    assert.equal(monthKeyFromIsoDate("2026-03-31T22:15:00.000Z"), "2026-03");
    assert.equal(monthKeyFromIsoDate("2026-04-01"), "2026-04");
  });

  it("builds and parses year/month parts for dropdowns", () => {
    assert.equal(monthKeyFromParts(2026, 9), "2026-09");
    assert.equal(monthKeyFromParts(2026, 13), null);
    assert.deepEqual(parseMonthKey("2026-09"), { year: 2026, month: 9 });
  });

  it("picks last snapshot per UTC month", () => {
    const byMonth = aggregateSnapshotsByMonth(
      [
        { capturedAt: new Date("2024-03-10T12:00:00Z"), totalValue: 1000, currency: "USD" },
        { capturedAt: new Date("2024-03-20T12:00:00Z"), totalValue: 1100, currency: "USD" },
        { capturedAt: new Date("2024-04-01T00:00:00Z"), totalValue: 1200, currency: "USD" },
      ],
      "USD",
      { eurPerUsd: null, gbpPerUsd: null },
    );
    assert.equal(byMonth.get("2024-03"), 1100);
    assert.equal(byMonth.get("2024-04"), 1200);
  });

  it("converts T212 snapshot from account EUR into display USD", () => {
    const byMonth = aggregateSnapshotsByMonth(
      [{ capturedAt: new Date("2026-09-01T12:00:00Z"), totalValue: 9200, currency: "EUR" }],
      "USD",
      fx,
    );
    assert.equal(Math.round(byMonth.get("2026-09") ?? 0), 10000);
  });
});

describe("portfolioValueHistory listing currency", () => {
  it("uses Yahoo listing currency, not T212 wallet currency", () => {
    assert.equal(listingPriceCurrency("AAPL", "AAPL_US_EQ"), "USD");
    assert.equal(listingPriceCurrency("BP.L", "BPl_EQ"), "GBP");
    assert.equal(listingPriceCurrency("SAP.DE", "SAPd_EQ"), "EUR");
    assert.equal(isYahooPenceHistory("BP.L", "BPl_EQ"), true);
    assert.equal(isYahooPenceHistory("AAPL", "AAPL_US_EQ"), false);
  });

  it("scales London GBp history to pounds", () => {
    const bars: QuoteHistoryBar[] = [
      { date: "2024-03-01", close: 500 },
      { date: "2024-03-28", close: 520 },
    ];
    const scaled = prepareHistoryBarsForValue(bars, "BP.L", "BPl_EQ", null);
    assert.equal(scaled[1]!.close, 5.2);
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

  it("values US holdings with USD closes even when the row is stored in EUR", () => {
    const byMonth = computeMonthlyValuesFromHoldings(
      [{ symbolYahoo: "AAPL", symbolT212: "AAPL_US_EQ", quantity: 10, currency: "EUR" }],
      { AAPL: [{ date: "2024-03-28", close: 100 }] },
      fx,
      "EUR",
      ["2024-03"],
    );
    // 10 * $100 = $1000 → €920
    assert.equal(byMonth.get("2024-03"), 920);
  });

  it("values London holdings from pence history in GBP then converts to EUR", () => {
    const bars = prepareHistoryBarsForValue(
      [{ date: "2024-03-28", close: 500 }],
      "BP.L",
      "BPl_EQ",
      null,
    );
    const byMonth = computeMonthlyValuesFromHoldings(
      [{ symbolYahoo: "BP.L", symbolT212: "BPl_EQ", quantity: 10, currency: "EUR" }],
      { "BP.L": bars },
      fx,
      "EUR",
      ["2024-03"],
    );
    // 10 * £5 = £50 → EUR via gbpPerUsd/eurPerUsd = 50 / 0.79 * 0.92
    assert.equal(Math.round((byMonth.get("2024-03") ?? 0) * 100) / 100, Math.round(((50 / 0.79) * 0.92) * 100) / 100);
  });
});

describe("portfolioValueHistory quantity timeline", () => {
  it("applies buys and sells at month end", () => {
    const months = ["2024-01", "2024-02", "2024-03"];
    const byMonth = quantitiesByMonthFromEvents(
      [
        { symbolYahoo: "AAPL", date: "2024-01-15", delta: 10 },
        { symbolYahoo: "AAPL", date: "2024-02-10", delta: -4 },
        { symbolYahoo: "AAPL", date: "2024-03-20", delta: 2 },
      ],
      months,
    );
    assert.equal(byMonth.get("2024-01")?.get("AAPL"), 10);
    assert.equal(byMonth.get("2024-02")?.get("AAPL"), 6);
    assert.equal(byMonth.get("2024-03")?.get("AAPL"), 8);
  });

  it("does not apply a fill after month-end to that month", () => {
    const byMonth = quantitiesByMonthFromEvents(
      [{ symbolYahoo: "AAPL", date: "2024-04-01", delta: 10 }],
      ["2024-03", "2024-04"],
    );
    assert.equal(byMonth.get("2024-03")?.get("AAPL"), undefined);
    assert.equal(byMonth.get("2024-04")?.get("AAPL"), 10);
  });

  it("rejects incomplete timelines that do not match live holdings", () => {
    const months = calendarMonthsForEvents(
      [{ symbolYahoo: "AAPL", date: "2024-01-15", delta: 2 }],
      new Date("2024-03-15T12:00:00Z"),
    );
    const qtyByMonth = quantitiesByMonthFromEvents(
      [{ symbolYahoo: "AAPL", date: "2024-01-15", delta: 2 }],
      months,
    );
    assert.equal(
      quantityTimelineMatchesHoldings(
        qtyByMonth,
        "2024-03",
        [{ symbolYahoo: "AAPL", quantity: 10, currency: "USD" }],
      ),
      false,
    );
    assert.equal(
      quantityTimelineMatchesHoldings(
        qtyByMonth,
        "2024-03",
        [{ symbolYahoo: "AAPL", quantity: 2, currency: "USD" }],
      ),
      true,
    );
  });

  it("rejects extra reconstructed tickers not in live holdings", () => {
    const qtyByMonth = quantitiesByMonthFromEvents(
      [
        { symbolYahoo: "AAPL", date: "2024-01-15", delta: 10 },
        { symbolYahoo: "MSFT", date: "2024-02-01", delta: 5 },
      ],
      ["2024-03"],
    );
    assert.equal(
      quantityTimelineMatchesHoldings(
        qtyByMonth,
        "2024-03",
        [{ symbolYahoo: "AAPL", quantity: 10, currency: "USD" }],
      ),
      false,
    );
  });

  it("uses absolute share tolerance, not a relative percent", () => {
    const qtyByMonth = quantitiesByMonthFromEvents(
      [{ symbolYahoo: "AAPL", date: "2024-01-15", delta: 10.1 }],
      ["2024-03"],
    );
    assert.equal(
      quantityTimelineMatchesHoldings(
        qtyByMonth,
        "2024-03",
        [{ symbolYahoo: "AAPL", quantity: 10, currency: "USD" }],
      ),
      true,
    );
    assert.equal(
      quantityTimelineMatchesHoldings(
        qtyByMonth,
        "2024-03",
        [{ symbolYahoo: "AAPL", quantity: 9, currency: "USD" }],
      ),
      false,
    );
  });
});

describe("computeMonthlyValuesFromHoldings coverage", () => {
  it("returns null when any contributor lacks a month-end close", () => {
    const byMonth = computeMonthlyValuesFromHoldings(
      [
        { symbolYahoo: "AAPL", quantity: 10, currency: "USD" },
        { symbolYahoo: "MSFT", quantity: 5, currency: "USD" },
      ],
      {
        AAPL: [{ date: "2024-03-28", close: 100 }],
        MSFT: [],
      },
      { eurPerUsd: null, gbpPerUsd: null },
      "USD",
      ["2024-03"],
    );
    assert.equal(byMonth.get("2024-03"), null);
  });

  it("returns null when FX conversion is unavailable for a listing currency", () => {
    const byMonth = computeMonthlyValuesFromHoldings(
      [{ symbolYahoo: "NESN.SW", symbolT212: "NESNs_EQ", quantity: 10, currency: "EUR" }],
      { "NESN.SW": [{ date: "2024-03-28", close: 80 }] },
      { eurPerUsd: 0.92, gbpPerUsd: 0.79 },
      "EUR",
      ["2024-03"],
    );
    assert.equal(byMonth.get("2024-03"), null);
  });
});

describe("buildPortfolioValueChartSeries", () => {
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
      now: new Date("2024-03-20T12:00:00Z"),
    });
    assert.equal(series.length, 1);
    assert.equal(series[0]!.value, 5000);
    assert.equal(series[0]!.source, "manual");
  });

  it("does not invent a 5-year series from current quantities", () => {
    const series = buildPortfolioValueChartSeries({
      snapshots: [],
      manualRows: [],
      holdings: [{ symbolYahoo: "AAPL", quantity: 10, currency: "USD" }],
      historyBySymbol: {
        AAPL: [
          { date: "2024-01-30", close: 100 },
          { date: "2024-02-28", close: 110 },
          { date: "2024-03-15", close: 120 },
        ],
      },
      fx: { eurPerUsd: null, gbpPerUsd: null },
      baseCurrency: "USD",
      now: new Date("2024-03-20T12:00:00Z"),
    });
    assert.equal(series.every((p) => p.month === "2024-03"), true);
    assert.equal(series.length, 1);
    assert.equal(series[0]!.value, 1200);
    assert.equal(series[0]!.source, "computed");
  });

  it("uses reconstructed quantities for historical months when provided", () => {
    const qtyByMonth = quantitiesByMonthFromEvents(
      [
        { symbolYahoo: "AAPL", date: "2024-01-10", delta: 10 },
        { symbolYahoo: "AAPL", date: "2024-02-10", delta: 5 },
      ],
      ["2024-01", "2024-02"],
    );
    const series = buildPortfolioValueChartSeries({
      snapshots: [],
      manualRows: [],
      holdings: [{ symbolYahoo: "AAPL", quantity: 15, currency: "USD" }],
      historyBySymbol: {
        AAPL: [
          { date: "2024-01-31", close: 100 },
          { date: "2024-02-28", close: 110 },
        ],
      },
      fx: { eurPerUsd: null, gbpPerUsd: null },
      baseCurrency: "USD",
      qtyByMonth,
      now: new Date("2024-02-28T12:00:00Z"),
    });
    const jan = series.find((p) => p.month === "2024-01");
    const feb = series.find((p) => p.month === "2024-02");
    assert.equal(jan?.value, 1000);
    assert.equal(jan?.source, "computed");
    assert.equal(feb?.value, 1650);
    assert.equal(feb?.changePct, 65);
  });

  it("prefers live holdings value for the current month when no snapshot exists", () => {
    const series = buildPortfolioValueChartSeries({
      snapshots: [],
      manualRows: [],
      holdings: [{ symbolYahoo: "AAPL", quantity: 10, currency: "EUR" }],
      historyBySymbol: {},
      fx,
      baseCurrency: "EUR",
      liveValue: 4500,
      now: new Date("2026-09-14T12:00:00Z"),
    });
    assert.equal(series.length, 1);
    assert.equal(series[0]!.month, "2026-09");
    assert.equal(series[0]!.value, 4500);
    assert.equal(series[0]!.source, "computed");
  });

  it("keeps T212 snapshot over computed live value", () => {
    const series = buildPortfolioValueChartSeries({
      snapshots: [
        { capturedAt: new Date("2026-09-10T12:00:00Z"), totalValue: 8000, currency: "EUR" },
      ],
      manualRows: [],
      holdings: [{ symbolYahoo: "AAPL", quantity: 10, currency: "EUR" }],
      historyBySymbol: {},
      fx,
      baseCurrency: "EUR",
      liveValue: 4500,
      now: new Date("2026-09-14T12:00:00Z"),
    });
    assert.equal(series[0]!.value, 8000);
    assert.equal(series[0]!.source, "t212");
  });
});

describe("computeLiveHoldingsValue", () => {
  it("matches quote currency conversion used on the holdings tab", () => {
    const v = computeLiveHoldingsValue(
      [{ symbolYahoo: "AAPL", quantity: 10, currency: "EUR" }],
      { AAPL: { price: 200, currency: "USD" } },
      fx,
      "EUR",
    );
    assert.equal(v, 2000 * 0.92);
  });

  it("returns null when any holding lacks a convertible quote", () => {
    const v = computeLiveHoldingsValue(
      [
        { symbolYahoo: "AAPL", quantity: 10, currency: "USD" },
        { symbolYahoo: "MSFT", quantity: 5, currency: "USD" },
      ],
      { AAPL: { price: 100, currency: "USD" }, MSFT: null },
      { eurPerUsd: null, gbpPerUsd: null },
      "USD",
    );
    assert.equal(v, null);
  });
});

describe("pickPortfolioHistorySymbols", () => {
  it("marks incomplete when the Yahoo symbol cap would drop names", () => {
    const holdings = Array.from({ length: 41 }, (_, i) => ({
      symbolYahoo: `SYM${i}`,
      quantity: 1,
      currency: "USD",
    }));
    const picked = pickPortfolioHistorySymbols(holdings, undefined, 40);
    assert.equal(picked.complete, false);
    assert.equal(picked.symbols.length, 40);
  });
});

describe("parseChartBaseCurrency", () => {
  it("accepts EUR USD GBP and falls back otherwise", () => {
    assert.equal(parseChartBaseCurrency("eur", "USD"), "EUR");
    assert.equal(parseChartBaseCurrency("CHF", "EUR"), "EUR");
  });
});
