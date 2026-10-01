import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PORTFOLIO_DIVIDENDS_DAY_CACHE_KEY,
  beginPortfolioDividendsLoad,
  decidePortfolioDividendsLoad,
  invalidatePortfolioDividendsDayCache,
  isPortfolioDividendsLoadCurrent,
  isUsableDividendsPayload,
  parsePortfolioDividendsDayCache,
  readStoredPortfolioDividendsDayCache,
  userLocalCalendarDay,
  writeStoredPortfolioDividendsDayCache,
  type PortfolioDividendsDayMemory,
} from "@/lib/portfolioDividendsDayCache";

type Payload = {
  positions: [];
  payments: [];
  monthlyIncome: [];
  fx: { eurPerUsd: null };
  summary: { portfolioYieldOnValue: null };
  trading212: { connected: false };
};

function payload(): Payload {
  return {
    positions: [],
    payments: [],
    monthlyIncome: [],
    fx: { eurPerUsd: null },
    summary: { portfolioYieldOnValue: null },
    trading212: { connected: false },
  };
}

function memory(overrides: Partial<PortfolioDividendsDayMemory<Payload>> = {}): PortfolioDividendsDayMemory<Payload> {
  return {
    userId: "user-1",
    localDate: "2026-09-30",
    payload: payload(),
    reloadToken: 0,
    liveRefreshToken: 0,
    ...overrides,
  };
}

describe("userLocalCalendarDay", () => {
  it("uses the browser local calendar day, including late evening", () => {
    assert.equal(userLocalCalendarDay(new Date(2026, 8, 30, 0, 5, 0)), "2026-09-30");
    assert.equal(userLocalCalendarDay(new Date(2026, 8, 30, 23, 59, 0)), "2026-09-30");
    assert.equal(userLocalCalendarDay(new Date(2026, 9, 1, 0, 1, 0)), "2026-10-01");
  });
});

describe("decidePortfolioDividendsLoad", () => {
  const now = new Date(2026, 8, 30, 15, 0, 0);

  it("reuses a same-day stored payload on the first open of this tab", () => {
    const decision = decidePortfolioDividendsLoad({
      userId: "user-1",
      reloadToken: 0,
      liveRefreshToken: 0,
      now,
      memory: null,
      stored: memory(),
    });
    assert.equal(decision.action, "reuse");
    assert.deepEqual(decision.payload, payload());
    assert.equal(decision.adoptMemory?.localDate, "2026-09-30");
  });

  it("reuses session memory when the tab remounts the same day", () => {
    const decision = decidePortfolioDividendsLoad({
      userId: "user-1",
      reloadToken: 0,
      liveRefreshToken: 0,
      now,
      memory: memory(),
      stored: memory(),
    });
    assert.equal(decision.action, "reuse");
    assert.equal(decision.adoptMemory, null);
  });

  it("fetches on the next local calendar day", () => {
    const decision = decidePortfolioDividendsLoad({
      userId: "user-1",
      reloadToken: 0,
      liveRefreshToken: 0,
      now: new Date(2026, 9, 1, 0, 1, 0),
      memory: memory(),
      stored: memory(),
    });
    assert.equal(decision.action, "fetch");
    assert.equal(decision.payload, null);
  });

  it("forces a refetch when explicit refresh advances", () => {
    const decision = decidePortfolioDividendsLoad({
      userId: "user-1",
      reloadToken: 0,
      liveRefreshToken: 1,
      now,
      memory: memory(),
      stored: memory(),
    });
    assert.equal(decision.action, "force");
    assert.deepEqual(decision.payload, payload());
  });

  it("refetches without force when holdings or sync invalidate the cache", () => {
    const decision = decidePortfolioDividendsLoad({
      userId: "user-1",
      reloadToken: 1,
      liveRefreshToken: 0,
      now,
      memory: memory(),
      stored: memory(),
    });
    assert.equal(decision.action, "fetch");
  });

  it("does not reuse another user's payload", () => {
    const decision = decidePortfolioDividendsLoad({
      userId: "user-2",
      reloadToken: 0,
      liveRefreshToken: 0,
      now,
      memory: memory(),
      stored: memory(),
    });
    assert.equal(decision.action, "fetch");
    assert.equal(decision.payload, null);
  });

  it("fetches when refresh happened before this tab's first mount", () => {
    const decision = decidePortfolioDividendsLoad({
      userId: "user-1",
      reloadToken: 0,
      liveRefreshToken: 2,
      now,
      memory: null,
      stored: memory(),
    });
    assert.equal(decision.action, "force");
  });
});

describe("portfolio dividends day storage", () => {
  it("round-trips a same-user record and drops a different user", () => {
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
    writeStoredPortfolioDividendsDayCache(storage, memory());
    assert.equal(items.has(PORTFOLIO_DIVIDENDS_DAY_CACHE_KEY), true);
    assert.deepEqual(readStoredPortfolioDividendsDayCache<Payload>(storage, "user-1"), {
      userId: "user-1",
      localDate: "2026-09-30",
      payload: payload(),
    });
    assert.equal(readStoredPortfolioDividendsDayCache(storage, "user-2"), null);
    assert.equal(items.has(PORTFOLIO_DIVIDENDS_DAY_CACHE_KEY), false);
    assert.equal(parsePortfolioDividendsDayCache("{"), null);
  });

  it("drops a corrupt payload and clears the key", () => {
    const items = new Map<string, string>();
    const storage = mapStorage(items);
    items.set(
      PORTFOLIO_DIVIDENDS_DAY_CACHE_KEY,
      JSON.stringify({ userId: "user-1", localDate: "2026-09-30", payload: {} }),
    );
    assert.equal(isUsableDividendsPayload({}), false);
    assert.equal(parsePortfolioDividendsDayCache(items.get(PORTFOLIO_DIVIDENDS_DAY_CACHE_KEY) ?? null), null);
    assert.equal(readStoredPortfolioDividendsDayCache(storage, "user-1"), null);
    assert.equal(items.has(PORTFOLIO_DIVIDENDS_DAY_CACHE_KEY), false);
  });

  it("fetches after invalidation when tokens reset and memory is null", () => {
    const items = new Map<string, string>();
    const storage = mapStorage(items);
    const now = new Date(2026, 8, 30, 15, 0, 0);
    writeStoredPortfolioDividendsDayCache(storage, memory());
    invalidatePortfolioDividendsDayCache(storage);
    const stored = readStoredPortfolioDividendsDayCache<Payload>(storage, "user-1");
    assert.equal(stored, null);
    const decision = decidePortfolioDividendsLoad({
      userId: "user-1",
      reloadToken: 0,
      liveRefreshToken: 0,
      now,
      memory: null,
      stored,
    });
    assert.equal(decision.action, "fetch");
    assert.equal(decision.payload, null);
  });
});

describe("portfolio dividends load generation", () => {
  it("commits only the latest generation, including after invalidation", () => {
    const first = beginPortfolioDividendsLoad();
    const second = beginPortfolioDividendsLoad();
    assert.equal(isPortfolioDividendsLoadCurrent(first), false);
    assert.equal(isPortfolioDividendsLoadCurrent(second), true);
    invalidatePortfolioDividendsDayCache(null);
    assert.equal(isPortfolioDividendsLoadCurrent(second), false);
    const third = beginPortfolioDividendsLoad();
    assert.equal(isPortfolioDividendsLoadCurrent(third), true);
  });
});

function mapStorage(items: Map<string, string>) {
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}
