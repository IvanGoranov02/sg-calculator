import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decideT212OrdersCacheWrite,
  isT212OrdersCacheStale,
  mapT212OrderItemsToQtyEvents,
  mergeT212OrderItems,
  t212OrderItemKey,
} from "@/lib/t212OrderHistory";
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

describe("decideT212OrdersCacheWrite", () => {
  const prev: T212HistoryOrderItem[] = Array.from({ length: 6 }, (_, i) => ({
    fill: { filledAt: `2024-0${(i % 9) + 1}-01T00:00:00Z`, quantity: 1, type: "TRADE" },
    order: { ticker: `T${i}_US_EQ`, side: "BUY", status: "FILLED" },
  }));

  it("keeps previous cache and cursor when partial fetch returns no rows", () => {
    const decision = decideT212OrdersCacheWrite(prev, {
      items: [],
      partial: true,
      error: "rate limit",
      nextPagePath: "/api/v0/equity/history/orders?cursor=99",
    }, "/api/v0/equity/history/orders?cursor=50");
    assert.equal(decision.items.length, prev.length);
    assert.equal(decision.partial, true);
    assert.equal(decision.replaced, false);
    assert.equal(decision.nextPagePath, "/api/v0/equity/history/orders?cursor=99");
  });

  it("stores nextPagePath and merges when pagination stops early", () => {
    const incoming = prev.slice(0, 2);
    const decision = decideT212OrdersCacheWrite(prev, {
      items: incoming,
      partial: true,
      nextPagePath: "/api/v0/equity/history/orders?cursor=123",
    }, null);
    assert.equal(decision.items.length, prev.length);
    assert.equal(decision.partial, true);
    assert.equal(decision.replaced, false);
    assert.equal(decision.nextPagePath, "/api/v0/equity/history/orders?cursor=123");
  });

  it("clears partial state on a complete fetch", () => {
    const incoming = [...prev, {
      fill: { filledAt: "2024-09-01T00:00:00Z", quantity: 1, type: "TRADE" },
      order: { ticker: "NEW_US_EQ", side: "BUY", status: "FILLED" },
    }];
    const decision = decideT212OrdersCacheWrite(prev, {
      items: incoming,
      partial: false,
    }, null);
    assert.equal(decision.items.length, prev.length + 1);
    assert.equal(decision.partial, false);
    assert.equal(decision.replaced, true);
    assert.equal(decision.nextPagePath, null);
  });

  it("completes a resume walk by merging older pages into the larger newest cache", () => {
    const newestCache: T212HistoryOrderItem[] = Array.from({ length: 250 }, (_, i) => ({
      fill: { filledAt: `2024-09-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`, quantity: 1, type: "TRADE" },
      order: { ticker: `N${i}_US_EQ`, side: "BUY", status: "FILLED" },
    }));
    const olderPages: T212HistoryOrderItem[] = Array.from({ length: 40 }, (_, i) => ({
      fill: { filledAt: `2020-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`, quantity: 1, type: "TRADE" },
      order: { ticker: `OLD${i}_US_EQ`, side: "BUY", status: "FILLED" },
    }));
    const resumeCursor = "/api/v0/equity/history/orders?cursor=older";

    const decision = decideT212OrdersCacheWrite(
      newestCache,
      { items: olderPages, partial: false },
      resumeCursor,
    );

    assert.equal(decision.items.length, newestCache.length + olderPages.length);
    assert.equal(decision.partial, false);
    assert.equal(decision.replaced, true);
    assert.equal(decision.nextPagePath, null);
    assert.ok(decision.items.some((i) => t212OrderItemKey(i).startsWith("OLD0_US_EQ")));
    assert.ok(decision.items.some((i) => t212OrderItemKey(i).startsWith("N0_US_EQ")));
  });

  it("preserves the resume cursor when pagination errors mid-walk", () => {
    const resumeCursor = "/api/v0/equity/history/orders?cursor=50";
    const decision = decideT212OrdersCacheWrite(
      prev,
      {
        items: prev.slice(0, 2),
        partial: true,
        error: "Trading 212 rate limit exceeded. Try again later.",
        nextPagePath: resumeCursor,
      },
      "/api/v0/equity/history/orders?cursor=40",
    );
    assert.equal(decision.partial, true);
    assert.equal(decision.nextPagePath, resumeCursor);
    assert.equal(decision.items.length, prev.length);
  });

  it("falls back to the previous cursor when an error fetch omits nextPagePath", () => {
    const resumeCursor = "/api/v0/equity/history/orders?cursor=77";
    const decision = decideT212OrdersCacheWrite(
      prev,
      {
        items: [],
        partial: true,
        error: "Trading 212 429: rate limit",
      },
      resumeCursor,
    );
    assert.equal(decision.partial, true);
    assert.equal(decision.nextPagePath, resumeCursor);
  });
});

describe("isT212OrdersCacheStale", () => {
  it("always retries partial caches", () => {
    const recent = new Date();
    assert.equal(isT212OrdersCacheStale(recent, true), true);
  });

  it("uses the 7-day window only for complete caches", () => {
    const recent = new Date();
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    assert.equal(isT212OrdersCacheStale(recent, false), false);
    assert.equal(isT212OrdersCacheStale(old, false), true);
  });
});
