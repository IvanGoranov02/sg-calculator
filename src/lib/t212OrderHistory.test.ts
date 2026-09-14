import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mapT212OrderItemsToQtyEvents, mergeT212OrderItems, t212OrderItemKey } from "@/lib/t212OrderHistory";
import type { T212HistoryOrderItem } from "@/lib/trading212Client";

describe("t212OrderHistory", () => {
  it("maps buy and sell fills to signed quantity events", () => {
    const items: T212HistoryOrderItem[] = [
      {
        fill: { filledAt: "2024-01-15T12:00:00Z", quantity: 10, type: "TRADE" },
        order: { ticker: "AAPL_US_EQ", side: "BUY", status: "FILLED" },
      },
      {
        fill: { filledAt: "2024-02-01T12:00:00Z", quantity: 3, type: "TRADE" },
        order: { ticker: "AAPL_US_EQ", side: "SELL", status: "FILLED" },
      },
      {
        fill: { filledAt: "2024-03-01T12:00:00Z", quantity: 2, type: "STOCK_SPLIT" },
        order: { ticker: "AAPL_US_EQ", side: "BUY", status: "FILLED" },
      },
    ];
    const events = mapT212OrderItemsToQtyEvents(items);
    assert.deepEqual(
      events.map((e) => e.delta),
      [10, -3, 2],
    );
    assert.equal(events[0]!.symbolYahoo, "AAPL");
    assert.equal(events[0]!.date, "2024-01-15");
  });

  it("skips cancelled orders", () => {
    const events = mapT212OrderItemsToQtyEvents([
      {
        fill: { filledAt: "2024-01-15T12:00:00Z", quantity: 10, type: "TRADE" },
        order: { ticker: "AAPL_US_EQ", side: "BUY", status: "CANCELLED" },
      },
    ]);
    assert.equal(events.length, 0);
  });

  it("merges order pages without dropping older fills", () => {
    const a: T212HistoryOrderItem = {
      fill: { filledAt: "2020-01-01T00:00:00Z", quantity: 1, type: "TRADE" },
      order: { ticker: "OLD_US_EQ", side: "BUY", status: "FILLED" },
    };
    const b: T212HistoryOrderItem = {
      fill: { filledAt: "2024-06-01T00:00:00Z", quantity: 2, type: "TRADE" },
      order: { ticker: "AAPL_US_EQ", side: "BUY", status: "FILLED" },
    };
    const merged = mergeT212OrderItems([a], [b, a]);
    assert.equal(merged.length, 2);
    assert.ok(merged.some((i) => t212OrderItemKey(i).startsWith("OLD_US_EQ")));
  });
});
