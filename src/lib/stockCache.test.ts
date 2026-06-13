import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyAdminOverlay,
  buildCachePayload,
  CACHE_MAX_AGE_MS,
  CACHE_SCHEMA_VERSION,
  cacheIsFresh,
  earningsReportDue,
  EARNINGS_REFRESH_MIN_INTERVAL_MS,
  GAP_FILL_RETRY_MS,
  gapFillIsDue,
  markGapFillAttempt,
  mergeAdminEditableIntoCache,
  readAdminEditedAt,
  readAdminOverlay,
  type CachePayload,
} from "@/lib/stockCache";
import type { AdminEditableBundle } from "@/lib/adminCacheSchema";
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

  it("keeps the flag across schema-version bumps (curated data is forever)", () => {
    const payload = buildCachePayload(makeBundle(), "2026-06-12T10:00:00.000Z") as CachePayload;
    payload.__cacheVersion = CACHE_SCHEMA_VERSION - 1;
    assert.equal(readAdminEditedAt(payload), "2026-06-12T10:00:00.000Z");
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

  it("keeps admin-edited payloads fresh even across schema bumps", () => {
    const payload = buildCachePayload(makeBundle(), "2026-06-12T10:00:00.000Z") as CachePayload;
    payload.__cacheVersion = CACHE_SCHEMA_VERSION - 1;
    assert.equal(cacheIsFresh(payload, new Date()), true);
  });
});

describe("gap-fill cooldown", () => {
  it("is due when never attempted", () => {
    const payload = buildCachePayload(makeBundle()) as CachePayload;
    assert.equal(gapFillIsDue(payload), true);
    assert.equal(gapFillIsDue(null), true);
  });

  it("is not due right after an attempt and survives persist", () => {
    const bundle = makeBundle();
    markGapFillAttempt(bundle);
    const persisted = buildCachePayload(bundle) as CachePayload;
    assert.equal(typeof persisted.__gapFillAt, "string");
    assert.equal(gapFillIsDue(persisted), false);
  });

  it("becomes due again after the retry window", () => {
    const payload = buildCachePayload(makeBundle()) as CachePayload;
    payload.__gapFillAt = new Date(Date.now() - GAP_FILL_RETRY_MS - 1000).toISOString();
    assert.equal(gapFillIsDue(payload), true);
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

function makeOverlay(): AdminEditableBundle {
  return {
    quote: { symbol: "TEST", name: "Curated Name", price: 0, change: 0, changesPercentage: 0 },
    income: [
      {
        date: "2023-12-31",
        symbol: "TEST",
        fiscalYear: "2023",
        revenue: 4242,
        grossProfit: 2000,
        operatingExpenses: 1000,
        netIncome: 808,
      },
    ],
    cashFlow: [],
    balanceSheet: [],
    incomeQuarterly: [],
    cashFlowQuarterly: [],
    balanceSheetQuarterly: [],
    dividendQuarterly: [],
    investor: { currency: "EUR" } as AdminEditableBundle["investor"],
  };
}

describe("buildCachePayload options + readAdminOverlay", () => {
  it("stores and reads back the admin overlay and last-full-fetch timestamp", () => {
    const overlay = makeOverlay();
    const payload = buildCachePayload(makeBundle(), {
      adminEditedAt: "2026-06-01T00:00:00.000Z",
      adminOverlay: overlay,
      lastFullFetchAt: "2026-06-01T00:00:00.000Z",
    }) as CachePayload;
    assert.equal(payload.__lastFullFetchAt, "2026-06-01T00:00:00.000Z");
    const read = readAdminOverlay(payload);
    assert.equal(read?.quote.name, "Curated Name");
    assert.equal(read?.income[0].revenue, 4242);
  });
});

describe("applyAdminOverlay", () => {
  it("admin-curated periods win; new periods from fresh data are kept", () => {
    const fresh = makeBundle();
    fresh.quote.name = "Fresh Name";
    fresh.income = [
      { date: "2023-12-31", symbol: "TEST", fiscalYear: "2023", revenue: 9999, grossProfit: 0, operatingExpenses: 0, netIncome: 0 },
      { date: "2024-12-31", symbol: "TEST", fiscalYear: "2024", revenue: 5000, grossProfit: 0, operatingExpenses: 0, netIncome: 900 },
    ];
    applyAdminOverlay(fresh, makeOverlay());

    const fy2023 = fresh.income.find((r) => r.fiscalYear === "2023");
    const fy2024 = fresh.income.find((r) => r.fiscalYear === "2024");
    assert.equal(fy2023?.revenue, 4242, "curated FY2023 wins over fresh");
    assert.equal(fy2024?.revenue, 5000, "new FY2024 from fresh report kept");
    assert.equal(fresh.quote.name, "Curated Name", "curated name wins");
    assert.equal(fresh.investor.currency, "EUR", "curated investor block wins");
  });

  it("leaves live price, history and earnings date untouched", () => {
    const fresh = makeBundle();
    fresh.quote.price = 123;
    fresh.quote.earningsDate = "2026-08-01";
    applyAdminOverlay(fresh, makeOverlay());
    assert.equal(fresh.quote.price, 123);
    assert.equal(fresh.quote.earningsDate, "2026-08-01");
    assert.equal(fresh.historical.length, 1);
  });
});

describe("earningsReportDue", () => {
  const day = 24 * 60 * 60 * 1000;
  const iso = (ms: number) => new Date(ms).toISOString();

  it("is due when the known earnings date has passed since the last full fetch", () => {
    const now = Date.parse("2026-06-12T00:00:00.000Z");
    const payload = makeBundle() as CachePayload;
    payload.quote.earningsDate = iso(now - 2 * day); // passed
    payload.__lastFullFetchAt = iso(now - 40 * day); // fetched well before earnings
    assert.equal(earningsReportDue(payload, now), true);
  });

  it("is not due before the earnings date", () => {
    const now = Date.parse("2026-06-12T00:00:00.000Z");
    const payload = makeBundle() as CachePayload;
    payload.quote.earningsDate = iso(now + 5 * day); // future
    payload.__lastFullFetchAt = iso(now - 40 * day);
    assert.equal(earningsReportDue(payload, now), false);
  });

  it("is throttled within the minimum interval after a full fetch", () => {
    const now = Date.parse("2026-06-12T00:00:00.000Z");
    const payload = makeBundle() as CachePayload;
    payload.quote.earningsDate = iso(now - 1000);
    payload.__lastFullFetchAt = iso(now - EARNINGS_REFRESH_MIN_INTERVAL_MS / 2);
    assert.equal(earningsReportDue(payload, now), false);
  });

  it("is not due without a known earnings date", () => {
    const now = Date.parse("2026-06-12T00:00:00.000Z");
    const payload = makeBundle() as CachePayload;
    payload.__lastFullFetchAt = iso(now - 40 * day);
    assert.equal(earningsReportDue(payload, now), false);
  });
});
