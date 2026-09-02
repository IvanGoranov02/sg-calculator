import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseQuotesHistorySymbols, QUOTES_HISTORY_MAX_SYMBOLS } from "@/lib/quotesHistory";

describe("parseQuotesHistorySymbols", () => {
  it("parses, dedupes, uppercases, and caps symbols", () => {
    const raw = "aapl, MSFT, aapl, bad!, nvda";
    const parsed = parseQuotesHistorySymbols(raw);
    assert.deepEqual(parsed, ["AAPL", "MSFT", "NVDA"]);
  });

  it("respects the max symbol cap", () => {
    const raw = Array.from({ length: 40 }, (_, i) => `S${i}`).join(",");
    const parsed = parseQuotesHistorySymbols(raw);
    assert.equal(parsed.length, QUOTES_HISTORY_MAX_SYMBOLS);
    assert.equal(parsed[0], "S0");
    assert.equal(parsed[QUOTES_HISTORY_MAX_SYMBOLS - 1], `S${QUOTES_HISTORY_MAX_SYMBOLS - 1}`);
  });

  it("returns empty for blank input", () => {
    assert.deepEqual(parseQuotesHistorySymbols(""), []);
    assert.deepEqual(parseQuotesHistorySymbols(" , , "), []);
  });
});
