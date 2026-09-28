import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizePositionsPayload,
  normalizeT212NextPagePath,
  normalizeT212Position,
  retryPathForEmptyHistoryPage,
} from "@/lib/trading212Client";

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

  it("rejects a path that would restart at the newest page", () => {
    assert.equal(normalizeT212NextPagePath("/api/v0/equity/history/orders?limit=50"), null);
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
