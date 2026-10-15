import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseWatchlistInput } from "@/lib/watchlistInput";

describe("watchlist request validation", () => {
  it("rejects malformed payloads rather than treating them as an empty list", () => {
    for (const body of [null, {}, { symbols: null }, { symbols: "AAPL" }, { symbols: ["AAPL", 5] }, { symbols: [" "] }]) {
      assert.equal(parseWatchlistInput(body), null);
    }
    assert.deepEqual(parseWatchlistInput({ symbols: [] }), []);
  });
  it("normalizes duplicates and rejects more than 50 distinct symbols", () => {
    assert.deepEqual(parseWatchlistInput({ symbols: [" aapl ", "AAPL", "MSFT"] }), ["AAPL", "MSFT"]);
    assert.equal(parseWatchlistInput({ symbols: Array.from({ length: 51 }, (_, i) => `SYM${i}`) }), null);
  });
});
