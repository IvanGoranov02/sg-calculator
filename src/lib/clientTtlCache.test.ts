import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decideClientTtlLoad,
  isFreshTtlRecord,
  parseClientTtlCacheRecord,
  writeStoredClientTtlCache,
  type ClientTtlMemory,
} from "@/lib/clientTtlCache";
import {
  PORTFOLIO_HOLDINGS_TTL_MS,
  PORTFOLIO_HOLDINGS_TTL_CACHE_KEY,
  decidePortfolioHoldingsLoad,
  invalidatePortfolioHoldingsTtlCache,
  isUsablePortfolioHoldingsPayload,
  type PortfolioHoldingsCachePayload,
} from "@/lib/portfolioHoldingsTtlCache";
import {
  EVENTS_TAB_TTL_MS,
  EVENTS_TAB_TTL_CACHE_KEY,
  decideEventsTabLoad,
  eventsSymbolsKey,
  invalidateEventsTabTtlCache,
  isUsableEventsTabPayload,
  type EventsTabCachePayload,
} from "@/lib/eventsTabTtlCache";
import {
  EVENTS_SERVER_MAX_AGE_SEC,
  PORTFOLIO_HOLDINGS_SERVER_MAX_AGE_SEC,
  privateTtlCacheControl,
  requestWantsRefresh,
} from "@/lib/apiCacheHeaders";

function holdingsPayload(): PortfolioHoldingsCachePayload {
  return {
    holdings: [],
    quotes: {},
    fx: { eurPerUsd: 0.9, gbpPerUsd: 0.8 },
    trading212: {
      encryptionConfigured: true,
      connected: false,
      environment: null,
      lastSyncAt: null,
      lastError: null,
    },
  };
}

function eventsPayload(symbolsKey = "AAPL,MSFT"): EventsTabCachePayload {
  return {
    portfolioSymbols: ["AAPL"],
    portfolioHoldings: [],
    portfolioQuotes: {},
    portfolioFx: { eurPerUsd: null, gbpPerUsd: null },
    dividendPayments: [],
    symbolsKey,
    rows: [],
  };
}

function memory(
  overrides: Partial<ClientTtlMemory<PortfolioHoldingsCachePayload>> = {},
): ClientTtlMemory<PortfolioHoldingsCachePayload> {
  return {
    userId: "user-1",
    fetchedAt: 1_000_000,
    payload: holdingsPayload(),
    reloadToken: 0,
    liveRefreshToken: 0,
    ...overrides,
  };
}

describe("isFreshTtlRecord", () => {
  it("accepts a record inside the TTL window", () => {
    assert.equal(
      isFreshTtlRecord({ userId: "u", fetchedAt: 1_000_000 }, "u", 3_600_000, 1_000_000 + 3_599_999),
      true,
    );
  });

  it("rejects expired, wrong user, and scope mismatches", () => {
    assert.equal(
      isFreshTtlRecord({ userId: "u", fetchedAt: 1_000_000 }, "u", 3_600_000, 1_000_000 + 3_600_001),
      false,
    );
    assert.equal(
      isFreshTtlRecord({ userId: "u", fetchedAt: 1_000_000 }, "other", 3_600_000, 1_000_000),
      false,
    );
    assert.equal(
      isFreshTtlRecord(
        { userId: "u", fetchedAt: 1_000_000, scopeKey: "AAPL" },
        "u",
        3_600_000,
        1_000_000,
        "MSFT",
      ),
      false,
    );
  });
});

describe("decidePortfolioHoldingsLoad", () => {
  const nowMs = 1_000_000 + 30 * 60 * 1000;

  it("reuses a fresh stored payload on the first open of this tab", () => {
    const decision = decidePortfolioHoldingsLoad({
      userId: "user-1",
      reloadToken: 0,
      liveRefreshToken: 0,
      nowMs,
      memory: null,
      stored: memory(),
    });
    assert.equal(decision.action, "reuse");
    assert.deepEqual(decision.payload, holdingsPayload());
    assert.equal(decision.adoptMemory?.fetchedAt, 1_000_000);
  });

  it("fetches after the 1h TTL expires", () => {
    const decision = decidePortfolioHoldingsLoad({
      userId: "user-1",
      reloadToken: 0,
      liveRefreshToken: 0,
      nowMs: 1_000_000 + PORTFOLIO_HOLDINGS_TTL_MS + 1,
      memory: memory(),
      stored: memory(),
    });
    assert.equal(decision.action, "fetch");
    assert.equal(decision.payload, null);
  });

  it("forces a refetch when explicit refresh advances", () => {
    const decision = decidePortfolioHoldingsLoad({
      userId: "user-1",
      reloadToken: 0,
      liveRefreshToken: 1,
      nowMs,
      memory: memory(),
      stored: memory(),
    });
    assert.equal(decision.action, "force");
  });

  it("refetches without force when holdings or sync invalidate", () => {
    const decision = decidePortfolioHoldingsLoad({
      userId: "user-1",
      reloadToken: 1,
      liveRefreshToken: 0,
      nowMs,
      memory: memory(),
      stored: memory(),
    });
    assert.equal(decision.action, "fetch");
  });
});

describe("decideEventsTabLoad", () => {
  const nowMs = 1_000_000 + 60 * 60 * 1000;

  it("reuses when symbolsKey matches within 24h", () => {
    const stored = {
      userId: "user-1",
      fetchedAt: 1_000_000,
      scopeKey: "AAPL,MSFT",
      payload: eventsPayload(),
    };
    const decision = decideEventsTabLoad({
      userId: "user-1",
      symbolsKey: "AAPL,MSFT",
      nowMs,
      memory: null,
      stored,
    });
    assert.equal(decision.action, "reuse");
    assert.equal(decision.payload?.symbolsKey, "AAPL,MSFT");
  });

  it("fetches when the watchlist/portfolio symbol set changes", () => {
    const stored = {
      userId: "user-1",
      fetchedAt: 1_000_000,
      scopeKey: "AAPL,MSFT",
      payload: eventsPayload(),
    };
    const decision = decideEventsTabLoad({
      userId: "user-1",
      symbolsKey: "AAPL,TSLA",
      nowMs,
      memory: null,
      stored,
    });
    assert.equal(decision.action, "fetch");
  });

  it("fetches after 24h", () => {
    const stored = {
      userId: "user-1",
      fetchedAt: 1_000_000,
      scopeKey: "AAPL",
      payload: eventsPayload("AAPL"),
    };
    const decision = decideEventsTabLoad({
      userId: "user-1",
      symbolsKey: "AAPL",
      nowMs: 1_000_000 + EVENTS_TAB_TTL_MS + 1,
      memory: null,
      stored,
    });
    assert.equal(decision.action, "fetch");
  });
});

describe("payload guards and helpers", () => {
  it("rejects corrupt holdings and events payloads", () => {
    assert.equal(isUsablePortfolioHoldingsPayload({}), false);
    assert.equal(isUsableEventsTabPayload({}), false);
    assert.equal(isUsablePortfolioHoldingsPayload(holdingsPayload()), true);
    assert.equal(isUsableEventsTabPayload(eventsPayload()), true);
  });

  it("sorts symbols for a stable events scope key", () => {
    assert.equal(eventsSymbolsKey(["msft", "AAPL", "msft"]), "AAPL,MSFT");
  });

  it("parses ttl records and drops bad JSON", () => {
    assert.equal(parseClientTtlCacheRecord("{", () => true), null);
    const ok = parseClientTtlCacheRecord(
      JSON.stringify({ userId: "u", fetchedAt: 1, payload: { ok: true } }),
      (v) => v != null && typeof v === "object" && "ok" in (v as object),
    );
    assert.equal(ok?.userId, "u");
  });
});

describe("apiCacheHeaders", () => {
  it("builds private TTL and refresh no-store headers", () => {
    assert.equal(
      privateTtlCacheControl(PORTFOLIO_HOLDINGS_SERVER_MAX_AGE_SEC, false),
      "private, max-age=3600, stale-while-revalidate=300",
    );
    assert.equal(privateTtlCacheControl(EVENTS_SERVER_MAX_AGE_SEC, true), "private, no-store");
    assert.equal(requestWantsRefresh("https://x.test/api/events?refresh=1"), true);
    assert.equal(requestWantsRefresh("https://x.test/api/events"), false);
  });
});

describe("decideClientTtlLoad edge", () => {
  it("forces when live refresh happened before this tab's first mount", () => {
    const decision = decideClientTtlLoad({
      userId: "user-1",
      ttlMs: PORTFOLIO_HOLDINGS_TTL_MS,
      reloadToken: 0,
      liveRefreshToken: 2,
      nowMs: 1_000_000 + 1000,
      memory: null,
      stored: memory(),
    });
    assert.equal(decision.action, "force");
  });
});

describe("sign-out and cross-user cache isolation", () => {
  it("drops stored holdings and events records on invalidate (sign-out path)", () => {
    const items = new Map<string, string>();
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => {
        items.set(key, value);
      },
      removeItem: (key: string) => {
        items.delete(key);
      },
    };

    writeStoredClientTtlCache(storage, PORTFOLIO_HOLDINGS_TTL_CACHE_KEY, {
      userId: "user-1",
      fetchedAt: Date.now(),
      payload: holdingsPayload(),
    });
    writeStoredClientTtlCache(storage, EVENTS_TAB_TTL_CACHE_KEY, {
      userId: "user-1",
      fetchedAt: Date.now(),
      scopeKey: "AAPL",
      payload: eventsPayload("AAPL"),
    });
    assert.equal(items.has(PORTFOLIO_HOLDINGS_TTL_CACHE_KEY), true);
    assert.equal(items.has(EVENTS_TAB_TTL_CACHE_KEY), true);

    invalidatePortfolioHoldingsTtlCache(storage);
    invalidateEventsTabTtlCache(storage);
    assert.equal(items.has(PORTFOLIO_HOLDINGS_TTL_CACHE_KEY), false);
    assert.equal(items.has(EVENTS_TAB_TTL_CACHE_KEY), false);
  });

  it("never emits public Cache-Control for TTL responses", () => {
    const header = privateTtlCacheControl(PORTFOLIO_HOLDINGS_SERVER_MAX_AGE_SEC, false);
    assert.match(header, /^private/);
    assert.equal(header.includes("public"), false);
  });
});
