import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import type { Trading212Environment } from "@prisma/client";

import {
  decideT212OrdersCacheWrite,
  isT212OrdersCacheStale,
  isT212OrdersScopeDenied,
  mapT212OrderItemsToQtyEvents,
  mergeT212OrderItems,
  ordersCacheGenerationUnchanged,
  ordersCacheGenerationWhere,
  shouldRecordOrdersScopeDenial,
  T212_ORDERS_SCOPE_DENIED,
  t212OrderItemKey,
  trading212SettingsOrdersCachePatch,
  type OrdersCacheGeneration,
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

function generation(overrides: Partial<OrdersCacheGeneration> = {}): OrdersCacheGeneration {
  return {
    apiKeyEnc: "key-a",
    environment: "live" as Trading212Environment,
    ordersCachedAt: new Date("2026-09-01T00:00:00Z"),
    ordersCacheNextPath: "/api/v0/equity/history/orders?cursor=1",
    ordersCachePartial: true,
    ordersCacheError: null,
    ...overrides,
  };
}

describe("orders cache reset and scope", () => {
  it("clears the orders cache when credentials are replaced or the environment changes", () => {
    const cleared = trading212SettingsOrdersCachePatch({
      savingCredentials: true,
      environmentChanged: false,
    });
    assert.ok(cleared);
    assert.equal(cleared?.ordersCache, Prisma.DbNull);
    assert.equal(cleared?.ordersCachedAt, null);
    assert.equal(cleared?.ordersCacheError, null);
    assert.equal(cleared?.ordersCachePartial, false);
    assert.equal(cleared?.ordersCacheNextPath, null);

    const envClear = trading212SettingsOrdersCachePatch({
      savingCredentials: false,
      environmentChanged: true,
    });
    assert.equal(envClear?.ordersCache, Prisma.DbNull);
    assert.equal(envClear?.ordersCachePartial, false);
  });

  it("does not clear the orders cache on an environment no-op", () => {
    assert.equal(
      trading212SettingsOrdersCachePatch({
        savingCredentials: false,
        environmentChanged: false,
      }),
      null,
    );
  });

  it("records missing history scope only for a first-page 403 with no cached fills", () => {
    assert.equal(
      shouldRecordOrdersScopeDenial({
        prevItemCount: 0,
        resumePath: null,
        fetchItemCount: 0,
        httpStatus: 403,
      }),
      true,
    );
    assert.equal(isT212OrdersScopeDenied(T212_ORDERS_SCOPE_DENIED), true);
  });

  it("does not treat a later-page 403 or generic forbidden copy as missing scope", () => {
    assert.equal(
      shouldRecordOrdersScopeDenial({
        prevItemCount: 4,
        resumePath: "/api/v0/equity/history/orders?cursor=9",
        fetchItemCount: 0,
        httpStatus: 403,
      }),
      false,
    );
    assert.equal(
      shouldRecordOrdersScopeDenial({
        prevItemCount: 0,
        resumePath: "/api/v0/equity/history/orders?cursor=9",
        fetchItemCount: 0,
        httpStatus: 403,
      }),
      false,
    );
    assert.equal(
      isT212OrdersScopeDenied("Trading 212 denied access with the current API key (forbidden)."),
      false,
    );
    assert.equal(isT212OrdersScopeDenied("Trading 212 403"), false);
    assert.equal(isT212OrdersScopeDenied(null), false);
  });

  it("keeps existing fills when a partial fetch returns no rows", () => {
    const prev: T212HistoryOrderItem[] = [
      {
        fill: { filledAt: "2020-01-01T00:00:00Z", quantity: 2, type: "TRADE" },
        order: { ticker: "AAPL_US_EQ", side: "BUY", status: "FILLED" },
      },
    ];
    const decision = decideT212OrdersCacheWrite(
      prev,
      {
        items: [],
        partial: true,
        status: 403,
        error: "Trading 212 denied access with the current API key (forbidden).",
        nextPagePath: "/api/v0/equity/history/orders?cursor=9",
      },
      "/api/v0/equity/history/orders?cursor=8",
    );
    assert.equal(decision.items.length, 1);
    assert.equal(decision.items[0]?.order?.ticker, "AAPL_US_EQ");
    assert.notEqual(decision.error, T212_ORDERS_SCOPE_DENIED);
    assert.equal(decision.partial, true);
    assert.equal(decision.nextPagePath, "/api/v0/equity/history/orders?cursor=9");
  });

  it("refuses a cache write after the key, environment, or cursor generation changes", () => {
    const expected = generation();
    assert.equal(ordersCacheGenerationUnchanged(expected, generation()), true);
    assert.equal(
      ordersCacheGenerationUnchanged(expected, generation({ apiKeyEnc: "key-b" })),
      false,
    );
    assert.equal(
      ordersCacheGenerationUnchanged(expected, generation({ environment: "demo" })),
      false,
    );
    assert.equal(
      ordersCacheGenerationUnchanged(
        expected,
        generation({ ordersCachedAt: null, ordersCacheNextPath: null, ordersCachePartial: false }),
      ),
      false,
    );
    assert.equal(
      ordersCacheGenerationUnchanged(
        expected,
        generation({ ordersCacheNextPath: "/api/v0/equity/history/orders?cursor=2" }),
      ),
      false,
    );
    const where = ordersCacheGenerationWhere("user-1", expected);
    assert.equal(where.userId, "user-1");
    assert.equal(where.apiKeyEnc, "key-a");
    assert.equal(where.environment, "live");
    assert.notEqual(ordersCacheGenerationWhere("user-1", generation({ apiKeyEnc: "key-b" })).apiKeyEnc, where.apiKeyEnc);
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
