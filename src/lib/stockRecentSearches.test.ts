import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseRecentStockSearchesJson, RECENT_STOCK_SEARCH_MAX } from "@/lib/stockRecentSearches";

describe("parseRecentStockSearchesJson", () => {
  it("parses string and object entries with dedupe", () => {
    const parsed = parseRecentStockSearchesJson(
      JSON.stringify([
        "aapl",
        { symbol: "MSFT", name: "Microsoft" },
        { symbol: "aapl", name: "Apple Inc." },
      ]),
    );
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0]!.symbol, "AAPL");
    assert.equal(parsed[1]!.symbol, "MSFT");
    assert.equal(parsed[1]!.name, "Microsoft");
  });

  it("caps at RECENT_STOCK_SEARCH_MAX", () => {
    const many = Array.from({ length: 20 }, (_, i) => `S${i}`);
    assert.equal(parseRecentStockSearchesJson(JSON.stringify(many)).length, RECENT_STOCK_SEARCH_MAX);
  });
});
