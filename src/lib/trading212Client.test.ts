import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizePositionsPayload,
  nextOrdersPathAfterFalseEnd,
  normalizeT212NextPagePath,
  normalizeT212OrdersResumePath,
  normalizeT212Position,
  oldestT212HistoryCursorMs,
  ordersNextPathAvoidingSkip,
  resolveT212NextPagePath,
  retryPathForEmptyHistoryPage,
  t212CashBalance,
  t212HoldingsMarketValue,
  t212OrderItemKey,
  T212_ORDERS_LIMIT10_RESTART_PATH,
  T212_ORDERS_LIMIT10_WALK_PREFIX,
} from "@/lib/trading212Client";
import type { T212HistoryOrderItem } from "@/lib/trading212Client";

describe("normalizePositionsPayload", () => {
  it("accepts a top-level array", () => {
    const page = normalizePositionsPayload([
      { instrument: { ticker: "AAPL_US_EQ" }, quantity: 1 },
      { instrument: { ticker: "UBERd_EQ" }, quantity: 3 },
    ]);
    assert.equal(page.nextPagePath, null);
    assert.equal(page.positions.length, 2);
    assert.equal(page.positions[0]?.instrument?.ticker, "AAPL_US_EQ");
    assert.equal(page.positions[1]?.instrument?.ticker, "UBERd_EQ");
  });

  it("accepts paginated { items, nextPagePath }", () => {
    const page = normalizePositionsPayload({
      items: [{ instrument: { ticker: "MSFT_US_EQ" }, quantity: 2 }],
      nextPagePath: "/api/v0/equity/positions?cursor=abc&limit=50",
    });
    assert.equal(page.positions.length, 1);
    assert.equal(page.nextPagePath, "/api/v0/equity/positions?cursor=abc&limit=50");
  });

  it("accepts { positions } wrapper", () => {
    const page = normalizePositionsPayload({
      positions: [{ ticker: "APCd_EQ", quantity: 1, averagePrice: 170 }],
    });
    assert.equal(page.positions.length, 1);
    assert.equal(page.positions[0]?.instrument?.ticker, "APCd_EQ");
    assert.equal(page.positions[0]?.averagePricePaid, 170);
  });

  it("ignores nextPagePath null string", () => {
    const page = normalizePositionsPayload({ items: [], nextPagePath: "null" });
    assert.equal(page.nextPagePath, null);
  });
});

describe("normalizeT212NextPagePath", () => {
  it("drops null cursors and valueless instrumentCode", () => {
    assert.equal(normalizeT212NextPagePath(null), null);
    assert.equal(normalizeT212NextPagePath("null"), null);
    assert.equal(normalizeT212NextPagePath("null&ticker=AAPL_US_EQ"), null);
    assert.equal(
      normalizeT212NextPagePath("/api/v0/equity/history/orders?cursor=123&limit=50&instrumentCode"),
      "/api/v0/equity/history/orders?cursor=123&limit=50",
    );
  });

  it("keeps a dividend or position path that has no cursor", () => {
    assert.equal(
      normalizeT212NextPagePath("/api/v0/equity/history/dividends?limit=50"),
      "/api/v0/equity/history/dividends?limit=50",
    );
  });

  it("rejects an orders path without a cursor instead of treating it as the end", () => {
    assert.equal(
      normalizeT212NextPagePath("/api/v0/equity/history/orders?limit=50", { requireCursor: true }),
      null,
    );
    assert.deepEqual(
      resolveT212NextPagePath("/api/v0/equity/history/orders?limit=50", { requireCursor: true }),
      { action: "reject" },
    );
    assert.deepEqual(resolveT212NextPagePath("null", { requireCursor: true }), { action: "end" });
  });

  it("does not follow a resume path of the string null", () => {
    assert.equal(normalizeT212OrdersResumePath("null"), null);
    assert.equal(normalizeT212OrdersResumePath("null&ticker=AAPL_US_EQ"), null);
    assert.equal(
      normalizeT212OrdersResumePath("/api/v0/equity/history/orders?cursor=5&limit=50"),
      "/api/v0/equity/history/orders?cursor=5&limit=50",
    );
  });

  it("resumes the cursor-less limit=10 restart and strips the walk marker", () => {
    assert.equal(
      normalizeT212OrdersResumePath("/api/v0/equity/history/orders?limit=10"),
      T212_ORDERS_LIMIT10_RESTART_PATH,
    );
    assert.equal(normalizeT212OrdersResumePath("/api/v0/equity/history/orders?limit=50"), null);
    assert.equal(
      normalizeT212OrdersResumePath(
        `${T212_ORDERS_LIMIT10_WALK_PREFIX}/api/v0/equity/history/orders?cursor=5&limit=10`,
      ),
      "/api/v0/equity/history/orders?cursor=5&limit=10",
    );
  });
});

describe("retryPathForEmptyHistoryPage", () => {
  it("retries an empty follow-up page at a smaller limit once", () => {
    const retry = retryPathForEmptyHistoryPage({
      requestedPath: "/api/v0/equity/history/orders?cursor=99&limit=50&instrumentCode",
      itemCount: 0,
      nextPagePath: null,
      retriedCursors: new Set(),
    });
    assert.ok(retry);
    const params = new URLSearchParams(retry!.slice(retry!.indexOf("?") + 1));
    assert.equal(params.get("cursor"), "99");
    assert.equal(params.get("limit"), "10");
    assert.equal(params.get("instrumentCode"), null);
  });

  it("does not retry the same cursor twice or a short page", () => {
    assert.equal(
      retryPathForEmptyHistoryPage({
        requestedPath: "/api/v0/equity/history/orders?cursor=99&limit=50",
        itemCount: 0,
        nextPagePath: null,
        retriedCursors: new Set(["99"]),
      }),
      null,
    );
    assert.equal(
      retryPathForEmptyHistoryPage({
        requestedPath: "/api/v0/equity/history/orders?cursor=99&limit=50",
        itemCount: 10,
        nextPagePath: null,
        retriedCursors: new Set(),
      }),
      null,
    );
  });
});

describe("nextOrdersPathAfterFalseEnd", () => {
  const older: T212HistoryOrderItem = {
    fill: { filledAt: "2020-03-01T00:00:00.000Z", quantity: 1, type: "TRADE" },
    order: { ticker: "AAPL_US_EQ", side: "BUY", status: "FILLED" },
  };
  const newer: T212HistoryOrderItem = {
    fill: { filledAt: "2024-06-01T00:00:00.000Z", quantity: 2, type: "TRADE" },
    order: { ticker: "MSFT_US_EQ", side: "BUY", status: "FILLED" },
  };
  const oldestMs = String(Date.parse("2020-03-01T00:00:00.000Z"));

  it("restarts at limit=10 with no cursor after a full page that claims to be the end", () => {
    const path = nextOrdersPathAfterFalseEnd({
      requestedPath: "/api/v0/equity/history/orders?limit=50",
      pageItemCount: 50,
      collected: [newer, older],
      triedFallbackPaths: new Set(),
    });
    assert.equal(path, T212_ORDERS_LIMIT10_RESTART_PATH);
    assert.equal(path?.includes("cursor="), false);
    assert.equal(oldestT212HistoryCursorMs([newer, older]), Number(oldestMs));
  });

  it("restarts from limit=10 with no cursor when the empty page cursor is the fill time", () => {
    const filledAt = older.fill!.filledAt!;
    const cursor = String(Date.parse(filledAt));
    const path = nextOrdersPathAfterFalseEnd({
      requestedPath: `/api/v0/equity/history/orders?cursor=${cursor}&limit=10`,
      pageItemCount: 0,
      collected: [newer, older],
      triedFallbackPaths: new Set(),
    });
    assert.equal(cursor, oldestMs);
    assert.equal(path, T212_ORDERS_LIMIT10_RESTART_PATH);
    assert.equal(path?.includes(`cursor=${cursor}`), false);
  });

  it("accepts a short page as the end", () => {
    assert.equal(
      nextOrdersPathAfterFalseEnd({
        requestedPath: "/api/v0/equity/history/orders?cursor=999&limit=50",
        pageItemCount: 12,
        collected: [older],
        triedFallbackPaths: new Set(),
      }),
      null,
    );
  });

  it("does not issue the cursor-less restart twice, and a limit=10 walk ends on an empty page", () => {
    assert.equal(
      nextOrdersPathAfterFalseEnd({
        requestedPath: `/api/v0/equity/history/orders?cursor=${oldestMs}&limit=10`,
        pageItemCount: 0,
        collected: [older],
        triedFallbackPaths: new Set([T212_ORDERS_LIMIT10_RESTART_PATH]),
      }),
      null,
    );
    assert.equal(
      nextOrdersPathAfterFalseEnd({
        requestedPath: `/api/v0/equity/history/orders?cursor=${oldestMs}&limit=10`,
        pageItemCount: 0,
        collected: [older],
        triedFallbackPaths: new Set(),
        limit10Walk: true,
      }),
      null,
    );
    assert.equal(
      nextOrdersPathAfterFalseEnd({
        requestedPath: T212_ORDERS_LIMIT10_RESTART_PATH,
        pageItemCount: 10,
        collected: [older],
        triedFallbackPaths: new Set(),
      }),
      null,
    );
  });
});

describe("ordersNextPathAvoidingSkip", () => {
  const page = [
    {
      fill: { filledAt: "2024-06-01T00:00:00.000Z", quantity: 2, type: "TRADE" },
      order: { ticker: "MSFT_US_EQ", side: "BUY", status: "FILLED" },
    },
    {
      fill: { filledAt: "2020-03-01T00:00:00.000Z", quantity: 1, type: "TRADE" },
      order: { ticker: "AAPL_US_EQ", side: "BUY", status: "FILLED", dateModified: "2020-03-01T00:00:00.000Z" },
    },
  ];
  const oldest = String(Date.parse("2020-03-01T00:00:00.000Z"));

  it("keeps a cursor that is not older than the oldest item", () => {
    const next = `/api/v0/equity/history/orders?cursor=${oldest}&limit=50`;
    assert.equal(
      ordersNextPathAvoidingSkip({
        requestedPath: "/api/v0/equity/history/orders?limit=50",
        pageItems: page,
        nextPagePath: next,
      }),
      next,
    );
  });

  it("rewinds a cursor that jumped past the oldest item on the page", () => {
    const skipped = String(Date.parse("2019-01-01T00:00:00.000Z"));
    const fixed = ordersNextPathAvoidingSkip({
      requestedPath: "/api/v0/equity/history/orders?limit=50",
      pageItems: page,
      nextPagePath: `/api/v0/equity/history/orders?cursor=${skipped}&limit=50`,
    });
    assert.equal(fixed, `/api/v0/equity/history/orders?cursor=${oldest}&limit=50`);
  });

  it("does not invent a next page when Trading 212 reported the end", () => {
    assert.equal(
      ordersNextPathAvoidingSkip({
        requestedPath: "/api/v0/equity/history/orders?cursor=1&limit=50",
        pageItems: page,
        nextPagePath: null,
      }),
      null,
    );
  });
});

describe("t212HoldingsMarketValue", () => {
  it("uses investments.currentValue when it is already holdings-only", () => {
    const summary = {
      totalValue: 10_500,
      investments: { currentValue: 10_000 },
      cash: { availableToTrade: 400, inPies: 50, reservedForOrders: 50 },
    };
    assert.equal(t212CashBalance(summary), 500);
    assert.equal(t212HoldingsMarketValue(summary), 10_000);
  });

  it("removes cash when totalValue and currentValue are the same account total", () => {
    const summary = {
      totalValue: 10_500,
      investments: { currentValue: 10_500 },
      cash: { availableToTrade: 500 },
    };
    assert.equal(t212HoldingsMarketValue(summary), 10_000);
  });

  it("subtracts cash from totalValue when investments are missing", () => {
    assert.equal(
      t212HoldingsMarketValue({
        totalValue: 8_000,
        cash: { availableToTrade: 300, reservedForOrders: 200 },
      }),
      7_500,
    );
  });
});

describe("t212OrderItemKey", () => {
  it("keeps two fills that share ticker, time, and quantity when fill ids differ", () => {
    const a = {
      fill: { id: 1, filledAt: "2024-06-01T00:00:00.000Z", quantity: 1 },
      order: { ticker: "AAPL_US_EQ", side: "BUY" },
    };
    const b = {
      fill: { id: 2, filledAt: "2024-06-01T00:00:00.000Z", quantity: 1 },
      order: { ticker: "AAPL_US_EQ", side: "BUY" },
    };
    assert.notEqual(t212OrderItemKey(a), t212OrderItemKey(b));
  });
});

describe("normalizeT212Position", () => {
  it("copies legacy ticker and averagePrice onto the current shape", () => {
    const p = normalizeT212Position({
      ticker: "TL0d_EQ",
      averagePrice: 220,
      currentPrice: 225,
      quantity: 1,
      pieQuantity: 0,
    });
    assert.equal(p.instrument?.ticker, "TL0d_EQ");
    assert.equal(p.averagePricePaid, 220);
    assert.equal(p.quantityInPies, 0);
  });
});
