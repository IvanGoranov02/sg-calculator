import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCachePayload,
  CACHE_MAX_AGE_MS,
  CACHE_SCHEMA_VERSION,
  cacheIsFresh,
  mergeAdminEditableIntoCache,
  readAdminEditedAt,
  type CachePayload,
} from "@/lib/stockCache";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

function makeBundle(): StockAnalysisBundle {
  return {
    quote: { symbol: "TEST", name: "Test Co", price: 10, change: 1, changesPercentage: 2 },
    income: [],
    cashFlow: [],
    balanceSheet: [],
    historical: [{ date: "2026-01-02", close: 10 }],
    investor: { currency: "USD" } as StockAnalysisBundle["investor"],
    incomeQuarterly: [],
    cashFlowQuarterly: [],
    balanceSheetQuarterly: [],
    dividendQuarterly: [],
  };
}

describe("buildCachePayload", () => {
  it("stamps the schema version and omits the admin flag by default", () => {
    const payload = buildCachePayload(makeBundle()) as CachePayload;
    assert.equal(payload.__cacheVersion, CACHE_SCHEMA_VERSION);
    assert.equal("__adminEditedAt" in payload, false);
  });

  it("stores the admin edit timestamp when provided", () => {
    const ts = "2026-06-12T10:00:00.000Z";
    const payload = buildCachePayload(makeBundle(), ts) as CachePayload;
    assert.equal(payload.__adminEditedAt, ts);
  });

  it("drops a stale admin flag carried on the bundle when none is passed", () => {
    const bundle = makeBundle() as StockAnalysisBundle & { __adminEditedAt?: string };
    bundle.__adminEditedAt = "2026-06-12T10:00:00.000Z";
    const payload = buildCachePayload(bundle) as CachePayload;
    assert.equal("__adminEditedAt" in payload, false);
  });
});

describe("readAdminEditedAt", () => {
  it("returns the timestamp for a current-version payload", () => {
    const ts = "2026-06-12T10:00:00.000Z";
    const payload = buildCachePayload(makeBundle(), ts) as CachePayload;
    assert.equal(readAdminEditedAt(payload), ts);
  });

  it("ignores the flag on outdated schema versions", () => {
    const payload = buildCachePayload(makeBundle(), "2026-06-12T10:00:00.000Z") as CachePayload;
    payload.__cacheVersion = CACHE_SCHEMA_VERSION - 1;
    assert.equal(readAdminEditedAt(payload), null);
  });

  it("returns null when the flag is absent", () => {
    const payload = buildCachePayload(makeBundle()) as CachePayload;
    assert.equal(readAdminEditedAt(payload), null);
    assert.equal(readAdminEditedAt(null), null);
  });
});

describe("cacheIsFresh", () => {
  it("expires plain payloads after the max age", () => {
    const payload = buildCachePayload(makeBundle()) as CachePayload;
    const old = new Date(Date.now() - CACHE_MAX_AGE_MS - 1000);
    assert.equal(cacheIsFresh(payload, old), false);
    assert.equal(cacheIsFresh(payload, new Date()), true);
  });

  it("never expires admin-edited payloads by age", () => {
    const payload = buildCachePayload(makeBundle(), "2026-06-12T10:00:00.000Z") as CachePayload;
    const old = new Date(Date.now() - CACHE_MAX_AGE_MS * 10);
    assert.equal(cacheIsFresh(payload, old), true);
  });

  it("still discards admin-edited payloads with an outdated schema", () => {
    const payload = buildCachePayload(makeBundle(), "2026-06-12T10:00:00.000Z") as CachePayload;
    payload.__cacheVersion = CACHE_SCHEMA_VERSION - 1;
    assert.equal(cacheIsFresh(payload, new Date()), false);
  });
});

describe("mergeAdminEditableIntoCache", () => {
  it("preserves price series from the existing row", () => {
    const edited = makeBundle();
    edited.historical = [];
    const existing = buildCachePayload(makeBundle()) as CachePayload;
    const merged = mergeAdminEditableIntoCache(edited, existing);
    assert.equal(merged.historical.length, 1);
  });
});
