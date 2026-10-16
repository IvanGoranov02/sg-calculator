import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeMarketNews } from "@/lib/marketNews";

describe("Yahoo market news dates", () => {
  it("preserves provider dates transformed by yahoo-finance2 instead of multiplying milliseconds", () => {
    const date = new Date("2026-10-15T10:00:00Z");
    const item = { title: "Headline", link: "https://example.com/news", providerPublishTime: date };
    assert.equal(normalizeMarketNews([item], 8)[0]!.publishedAt, date.toISOString());
    assert.equal(normalizeMarketNews([{ ...item, providerPublishTime: date.getTime() / 1_000 }], 8)[0]!.publishedAt, date.toISOString());
  });

  it("keeps valid headlines when another item has an invalid timestamp", () => {
    const rows = normalizeMarketNews([
      { title: "One", link: "https://example.com/1", providerPublishTime: new Date("invalid") },
      { title: "Two", link: "https://example.com/2", providerPublishTime: new Date("2026-10-15") },
    ], 8);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.publishedAt, null);
    assert.equal(rows[1]!.publishedAt, "2026-10-15T00:00:00.000Z");
  });
});
