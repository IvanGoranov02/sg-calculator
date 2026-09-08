import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { T212HistoryDividendItem } from "@/lib/trading212Client";
import {
  decideT212DividendsCacheWrite,
  mergeT212DividendItems,
  t212DividendPaymentKey,
} from "@/lib/t212DividendsCache";

describe("t212DividendPaymentKey", () => {
  it("builds a stable composite key", () => {
    const key = t212DividendPaymentKey({
      ticker: "AAPL_US_EQ",
      paidOn: "2024-06-01",
      amount: 12.5,
      currency: "usd",
    });
    assert.equal(key, "AAPL_US_EQ|2024-06-01|12.5|USD");
  });
});

describe("mergeT212DividendItems", () => {
  it("unions previous and incoming without dropping older rows", () => {
    const prev: T212HistoryDividendItem[] = [
      { ticker: "OLD", paidOn: "2020-01-01", amount: 1, currency: "USD" },
      { ticker: "AAPL", paidOn: "2024-06-01", amount: 2, currency: "USD" },
    ];
    const incoming: T212HistoryDividendItem[] = [
      { ticker: "AAPL", paidOn: "2024-06-01", amount: 2, currency: "USD" },
      { ticker: "MSFT", paidOn: "2024-07-01", amount: 3, currency: "USD" },
    ];
    const merged = mergeT212DividendItems(prev, incoming);
    assert.equal(merged.length, 3);
    assert.ok(merged.some((i) => i.ticker === "OLD"));
  });
});

describe("decideT212DividendsCacheWrite", () => {
  const prev: T212HistoryDividendItem[] = Array.from({ length: 6 }, (_, i) => ({
    ticker: `T${i}`,
    paidOn: `2024-0${(i % 9) + 1}-01`,
    amount: i + 1,
    currency: "USD",
  }));

  it("keeps previous cache when partial fetch returns fewer rows", () => {
    const incoming = prev.slice(0, 2);
    const decision = decideT212DividendsCacheWrite(prev, {
      items: incoming,
      partial: true,
      error: "rate limit",
    });
    assert.equal(decision.items.length, prev.length);
    assert.equal(decision.partial, true);
    assert.equal(decision.replaced, false);
  });

  it("replaces when complete fetch is at least as large as cache", () => {
    const incoming = [...prev, { ticker: "NEW", paidOn: "2024-09-01", amount: 9, currency: "USD" }];
    const decision = decideT212DividendsCacheWrite(prev, {
      items: incoming,
      partial: false,
    });
    assert.equal(decision.items.length, prev.length + 1);
    assert.equal(decision.partial, false);
    assert.equal(decision.replaced, true);
  });

  it("does not shrink cache when complete fetch is smaller than stored history", () => {
    const incoming = prev.slice(0, 3);
    const decision = decideT212DividendsCacheWrite(prev, {
      items: incoming,
      partial: false,
    });
    assert.equal(decision.items.length, prev.length);
    assert.equal(decision.partial, true);
    assert.equal(decision.replaced, false);
  });
});
