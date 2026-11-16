import assert from "node:assert/strict";
import { test } from "node:test";

import { freshnessLabel } from "../freshnessLabel";
import { fiscalYearEndMonth, quarterLabel, quarterTitle } from "../quarterLabels";
import { readWatchlistSnapshot, writeWatchlistSnapshot } from "../watchlistSnapshot";
import type { PeriodRow } from "./periods";
import { latestAnnualFromRows, ttmMetricsFromRows } from "./storeViews";

const ENDS = ["2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30", "2026-09-30"];

function quarter(end: string, revenue: number, netIncome: number): PeriodRow {
  return {
    symbol: "X",
    kind: "Q",
    end,
    trust: "verified",
    source: "sec+yahoo",
    data: {
      inc: { revenue, grossProfit: revenue * 0.5, operatingExpenses: 0, netIncome, operatingIncome: revenue * 0.3 },
      bs: { stockholdersEquity: 400, totalAssets: 1000 } as never,
    },
  };
}

test("TTM ratios come from the last four stored quarters; growth from the year-ago quarter", () => {
  const rows = ENDS.map((end, i) => quarter(end, i === 0 ? 80 : 100, i === 0 ? 8 : 10));
  const m = ttmMetricsFromRows(rows);
  assert.ok(m);
  assert.equal(m.profitMargins, 0.1);
  assert.equal(m.grossMargins, 0.5);
  assert.equal(m.operatingMargins, 0.3);
  assert.equal(m.returnOnEquity, 0.1);
  assert.equal(m.returnOnAssets, 0.04);
  assert.equal(m.revenueGrowth, 0.25);
  assert.equal(m.earningsGrowth, 0.25);
});

test("no TTM ratios without an unbroken year of quarters", () => {
  assert.equal(ttmMetricsFromRows(ENDS.slice(2).map((end) => quarter(end, 100, 10))), null);
  const holed = [quarter("2025-03-31", 100, 10), ...ENDS.slice(2).map((end) => quarter(end, 100, 10))];
  assert.equal(ttmMetricsFromRows(holed), null);
});

test("latest stored fiscal year for the DCF seed skips disputed years", () => {
  const annual = (end: string, trust: PeriodRow["trust"], revenue: number): PeriodRow => ({
    symbol: "X",
    kind: "A",
    end,
    trust,
    source: "sec",
    data: {
      inc: { revenue, grossProfit: 0, operatingExpenses: 0, netIncome: 10, operatingIncome: revenue / 4 },
      cf: { freeCashFlow: 30, operatingCashFlow: 40 } as never,
    },
  });
  const out = latestAnnualFromRows([annual("2024-12-31", "verified", 200), annual("2025-12-31", "disputed", 999)]);
  assert.equal(out?.end, "2024-12-31");
  assert.equal(out?.operatingMarginPct, 25);
  assert.equal(out?.freeCashFlow, 30);
  assert.equal(latestAnnualFromRows([]), null);
});

test("watchlist snapshot: only symbols still on the list, in list order, and not when too old", () => {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  const now = Date.parse("2026-11-16T10:00:00Z");
  writeWatchlistSnapshot(storage, {
    fetchedAt: now,
    quotes: [{ symbol: "AAPL" }, { symbol: "MSFT" }, { symbol: "GONE" }],
    history: { AAPL: [1], GONE: [2] },
  });
  const snap = readWatchlistSnapshot<{ symbol: string }, number>(storage, ["MSFT", "AAPL"], now + 60_000);
  assert.deepEqual(snap?.quotes.map((q) => q.symbol), ["MSFT", "AAPL"]);
  assert.deepEqual(Object.keys(snap?.history ?? {}), ["AAPL"]);
  assert.equal(readWatchlistSnapshot(storage, ["MSFT"], now + 8 * 86_400_000), null);
  assert.equal(readWatchlistSnapshot(storage, ["NVDA"], now), null);
});

test("freshness label", () => {
  const t = Date.parse("2026-11-16T10:00:00Z");
  assert.equal(freshnessLabel(t, t + 20_000, "en"), "Updated just now");
  assert.equal(freshnessLabel(t, t + 5 * 60_000, "bg"), "Обновено преди 5 мин");
  assert.equal(freshnessLabel(t, t + 3 * 3_600_000, "en"), "Updated 3 h ago");
  assert.equal(freshnessLabel(t, t + 2 * 86_400_000, "bg"), "Обновено преди 2 дни");
});

test("quarters are named, not dated: calendar and shifted fiscal years", () => {
  // Google: year ends in December; the quarter ending 30 Sep is Q3.
  assert.equal(quarterLabel("2026-09-30", 12, "en"), "Q3 '26");
  assert.equal(quarterTitle("2026-09-30", 12, "en"), "Q3 2026 · quarter ended 30 Sept 2026".replace("Sept", new Date(Date.UTC(2026, 8, 30)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })));
  // Apple: year ends late September (52/53 weeks); the December quarter opens the next fiscal year.
  const apple = fiscalYearEndMonth(["2024-09-28", "2025-09-27"]);
  assert.equal(apple, 9);
  assert.equal(quarterLabel("2025-12-27", apple, "en"), "Q1 FY26");
  assert.equal(quarterLabel("2026-06-27", apple, "bg"), "Q3 ФГ26");
  assert.equal(quarterLabel("2025-09-27", apple, "en"), "Q4 FY25");
  // Year ending a few days into February (Walmart-style 31 Jan / 2 Feb ends) counts as January.
  assert.equal(fiscalYearEndMonth(["2026-02-01"]), 1);
  assert.equal(quarterLabel("2026-05-03", 1, "en"), "Q1 FY27");
  assert.equal(fiscalYearEndMonth([]), 12);
});
