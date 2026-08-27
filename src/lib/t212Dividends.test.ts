import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mapT212DividendItem,
  recentT212DividendRows,
  sortT212DividendsRecent,
  T212_RECENT_DIVIDENDS_LIMIT,
} from "@/lib/t212Dividends";
import type { T212HistoryDividendItem } from "@/lib/trading212Client";

describe("mapT212DividendItem", () => {
  it("maps ticker, amount, currency, and paidOn", () => {
    const row = mapT212DividendItem({
      ticker: "AAPL",
      amount: 12.5,
      currency: "usd",
      paidOn: "2024-06-15",
    });
    assert.deepEqual(row, {
      ticker: "AAPL",
      amount: 12.5,
      currency: "USD",
      paidOn: "2024-06-15",
    });
  });

  it("normalizes missing fields", () => {
    const row = mapT212DividendItem({ amount: "bad" as unknown as number });
    assert.equal(row.ticker, "—");
    assert.equal(row.amount, null);
    assert.equal(row.currency, "—");
    assert.equal(row.paidOn, null);
  });
});

describe("sortT212DividendsRecent", () => {
  it("orders by paidOn descending", () => {
    const items: T212HistoryDividendItem[] = [
      { ticker: "A", paidOn: "2024-01-01" },
      { ticker: "B", paidOn: "2024-03-01" },
      { ticker: "C", paidOn: "2023-12-01" },
    ];
    const sorted = sortT212DividendsRecent(items);
    assert.deepEqual(sorted.map((i) => i.ticker), ["B", "A", "C"]);
  });
});

describe("recentT212DividendRows", () => {
  it("caps at the recent limit and maps rows", () => {
    const items: T212HistoryDividendItem[] = Array.from({ length: 50 }, (_, i) => ({
      ticker: `T${i}`,
      amount: i,
      currency: "USD",
      paidOn: `2024-${String(12 - (i % 12)).padStart(2, "0")}-15`,
    }));
    const rows = recentT212DividendRows(items);
    assert.equal(rows.length, T212_RECENT_DIVIDENDS_LIMIT);
    assert.ok(rows[0]?.paidOn);
    assert.equal(rows[0]?.currency, "USD");
  });
});
