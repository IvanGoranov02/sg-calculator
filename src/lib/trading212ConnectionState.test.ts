import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";
import { Prisma, type Trading212Connection } from "@prisma/client";

import { encryptSecret } from "@/lib/portfolioEncryption";
import { commitTrading212Sync, recordTrading212SyncError, saveTrading212Connection, t212AccountId, type Trading212StateDatabase } from "@/lib/trading212ConnectionState";
import { disconnectTrading212ForUser } from "@/lib/trading212Disconnect";
import { refreshT212DividendsCache } from "@/lib/t212DividendsCache";
import { fetchT212Positions } from "@/lib/trading212Client";

type Row = Record<string, unknown>;

function copy<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Prisma.Decimal.isDecimal(value)) return new Prisma.Decimal(String(value)) as T;
  if (Array.isArray(value)) return value.map((item) => copy(item)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) as T;
  }
  return value;
}

/** Isolated transactional Prisma adapter: tests exercise the actual services and HTTP client. */
function fixture(t: TestContext, overrides: Partial<Trading212Connection> = {}) {
  const originalEncryptionKey = process.env.PORTFOLIO_ENCRYPTION_KEY;
  process.env.PORTFOLIO_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  t.after(() => {
    if (originalEncryptionKey === undefined) delete process.env.PORTFOLIO_ENCRYPTION_KEY;
    else process.env.PORTFOLIO_ENCRYPTION_KEY = originalEncryptionKey;
  });
  const connection: Trading212Connection = {
    id: "connection-1", userId: "user-1", environment: "live", accountId: "101",
    apiKeyEnc: encryptSecret("original-test-key"), apiSecretEnc: encryptSecret("original-test-secret"),
    lastSyncAt: new Date("2026-01-01"), lastError: "old error",
    dividendsCache: [{ ticker: "OLD", paidOn: "2025-01-01", amount: 5 }],
    dividendsCachedAt: new Date("2026-01-01"), dividendsCachePartial: false, dividendsCacheError: null,
    ordersCache: [{ fill: { id: 1 } }], ordersCachedAt: new Date("2026-01-01"),
    ordersCachePartial: true, ordersCacheError: null, ordersCacheNextPath: "/api/v0/equity/history/orders?cursor=1",
    createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"), ...overrides,
  };
  const state = {
    connection: connection as Trading212Connection | null,
    holdings: [
      { userId: "user-1", symbolYahoo: "OLD", source: "t212" },
      { userId: "user-1", symbolYahoo: "MANUAL", source: "manual" },
    ] as Row[],
    snapshots: [{ userId: "user-1", totalValue: 100 }] as Row[],
    manualDividends: [{ userId: "user-1", amount: 3 }],
    manualMonthlyValues: [{ userId: "user-1", month: "2025-12", amount: 200 }],
    failCreate: false,
  };
  function matches(row: Row | null, where: Row) {
    return row !== null && Object.entries(where).every(([key, value]) => {
      const actual = row[key];
      return value instanceof Date && actual instanceof Date ? value.getTime() === actual.getTime() : actual === value;
    });
  }
  function updateConnection(data: Row) {
    for (const [key, value] of Object.entries(data)) {
      (state.connection as unknown as Row)[key] = value === Prisma.DbNull || value === Prisma.JsonNull ? null : value;
    }
  }
  const db = {
    trading212Connection: {
      findUnique: async () => state.connection ? copy(state.connection) : null,
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        if (!matches(state.connection as unknown as Row | null, where)) return { count: 0 };
        updateConnection(data);
        return { count: 1 };
      },
      update: async ({ data }: { data: Row }) => {
        updateConnection(data);
        return state.connection;
      },
      create: async ({ data }: { data: Row }) => {
        assert.equal(state.connection, null);
        state.connection = {
          ...connection, ...data, id: "connection-2", lastSyncAt: null, lastError: null,
          dividendsCache: null, dividendsCachedAt: null, dividendsCachePartial: false, dividendsCacheError: null,
          ordersCache: null, ordersCachedAt: null, ordersCachePartial: false, ordersCacheError: null, ordersCacheNextPath: null,
        } as Trading212Connection;
        return state.connection;
      },
      deleteMany: async ({ where }: { where: Row }) => {
        if (!matches(state.connection as unknown as Row | null, where)) return { count: 0 };
        state.connection = null;
        return { count: 1 };
      },
    },
    portfolioHolding: {
      findMany: async ({ where }: { where: Row }) => state.holdings.filter((row) => matches(row, where)),
      deleteMany: async ({ where }: { where: Row }) => {
        state.holdings = state.holdings.filter((row) => !matches(row, where));
      },
      createMany: async ({ data }: { data: Row[] }) => {
        if (state.failCreate) throw new Error("Test insert failure");
        state.holdings.push(...data);
      },
    },
    portfolioAccountSnapshot: {
      deleteMany: async ({ where }: { where: Row }) => {
        state.snapshots = state.snapshots.filter((row) => !matches(row, where));
      },
      create: async ({ data }: { data: Row }) => state.snapshots.push(data),
    },
  };
  let previousTransaction = Promise.resolve();
  const transaction = async (callback: (tx: typeof db) => Promise<unknown>) => {
    const previous = previousTransaction;
    let release!: () => void;
    previousTransaction = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const saved = copy(state);
    try {
      return await callback(db);
    } catch (error) {
      Object.assign(state, saved);
      throw error;
    } finally {
      release();
    }
  };
  return {
    state,
    connection: copy(connection),
    db: { ...db, $transaction: transaction } as unknown as Trading212StateDatabase,
  };
}

function summary(t: TestContext, id: number | string | undefined) {
  t.mock.method(globalThis, "fetch", async () => Response.json({ id, currency: "EUR", investments: { currentValue: 0 } }));
}

const replacement = { userId: "user-1", environment: "live" as const, apiKey: "replacement-test-key", apiSecret: "replacement-test-secret" };
const aapl = [{ instrument: { ticker: "AAPL_US_EQ", currency: "USD" }, quantity: 2, currentPrice: 200, averagePricePaid: 150 }];

describe("Trading 212 account state integration", () => {
  it("preserves history during a verified same-account credential rotation", async (t) => {
    const f = fixture(t);
    summary(t, "00101");
    await saveTrading212Connection(replacement, f.db);
    assert.equal(f.state.connection!.accountId, "101");
    assert.notEqual(f.state.connection!.apiKeyEnc, f.connection.apiKeyEnc);
    assert.deepEqual(f.state.connection!.dividendsCache, f.connection.dividendsCache);
    assert.deepEqual(f.state.connection!.ordersCache, f.connection.ordersCache);
    assert.equal(f.state.connection!.ordersCacheNextPath, f.connection.ordersCacheNextPath);
    assert.equal(f.state.holdings.length, 2);
    assert.equal(f.state.snapshots.length, 1);
  });

  it("clears all broker history for a different account while preserving manual records", async (t) => {
    const f = fixture(t);
    summary(t, 202);
    await saveTrading212Connection(replacement, f.db);
    assert.equal(f.state.connection!.accountId, "202");
    assert.equal(f.state.connection!.ordersCache, null);
    assert.equal(f.state.connection!.ordersCacheNextPath, null);
    assert.equal(f.state.connection!.dividendsCache, null);
    assert.equal(f.state.connection!.lastSyncAt, null);
    assert.deepEqual(f.state.holdings.map((row) => row.source), ["manual"]);
    assert.equal(f.state.snapshots.length, 0);
    assert.equal(f.state.manualDividends.length, 1);
    assert.equal(f.state.manualMonthlyValues.length, 1);
  });

  it("isolates demo/live even when the account number is the same", async (t) => {
    const f = fixture(t);
    summary(t, 101);
    await saveTrading212Connection({ ...replacement, environment: "demo" }, f.db);
    assert.equal(f.state.connection!.environment, "demo");
    assert.equal(f.state.connection!.dividendsCache, null);
    assert.equal(f.state.snapshots.length, 0);
    assert.deepEqual(f.state.holdings.map((row) => row.source), ["manual"]);
  });

  it("establishes legacy identity before preserving a same-account rotation", async (t) => {
    const f = fixture(t, { accountId: null });
    summary(t, 101);
    await saveTrading212Connection(replacement, f.db);
    assert.equal(f.state.connection!.accountId, "101");
    assert.deepEqual(f.state.connection!.dividendsCache, f.connection.dividendsCache);
    assert.equal(f.state.snapshots.length, 1);
  });

  it("clears a legacy account only after both identities prove it changed", async (t) => {
    const f = fixture(t, { accountId: null });
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => Response.json({ id: ++calls === 1 ? 202 : 101 }));
    await saveTrading212Connection(replacement, f.db);
    assert.equal(f.state.connection!.accountId, "202");
    assert.equal(f.state.connection!.dividendsCache, null);
    assert.equal(f.state.snapshots.length, 0);
    assert.deepEqual(f.state.holdings.map((row) => row.source), ["manual"]);
  });

  it("keeps legacy data when the original account identity cannot be established", async (t) => {
    const f = fixture(t, { accountId: null });
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => ++calls === 1 ? Response.json({ id: 202 }) : new Response(null, { status: 403 }));
    await assert.rejects(saveTrading212Connection(replacement, f.db), /Could not verify/);
    assert.deepEqual(f.state.connection, f.connection);
    assert.equal(f.state.holdings.length, 2);
    assert.equal(f.state.snapshots.length, 1);
  });

  it("isolates an environment-only change without new credentials", async (t) => {
    const f = fixture(t);
    summary(t, 101);
    await saveTrading212Connection({ ...replacement, environment: "demo", apiKey: "", apiSecret: "" }, f.db);
    assert.equal(f.state.connection!.environment, "demo");
    assert.notEqual(f.state.connection!.apiKeyEnc, f.connection.apiKeyEnc);
    assert.equal(f.state.connection!.dividendsCache, null);
    assert.equal(f.state.snapshots.length, 0);
  });

  it("leaves existing state untouched when replacement identity cannot be verified", async (t) => {
    const f = fixture(t);
    summary(t, undefined);
    await assert.rejects(saveTrading212Connection(replacement, f.db), /Could not verify/);
    assert.deepEqual(f.state.connection, f.connection);
    assert.equal(f.state.holdings.length, 2);
    assert.equal(f.state.snapshots.length, 1);
  });

  it("allows first connection without an account ID and learns it from a later sync", async (t) => {
    const f = fixture(t);
    f.state.connection = null;
    f.state.holdings = f.state.holdings.filter((row) => row.source === "manual");
    f.state.snapshots = [];
    summary(t, undefined);
    await saveTrading212Connection(replacement, f.db);
    assert.equal(f.state.connection!.accountId, null);
    const current = copy(f.state.connection!);
    await commitTrading212Sync({ userId: "user-1", connection: current, positions: aapl, summary: { id: 101, currency: "USD", investments: { currentValue: 400 } } }, f.db);
    assert.equal(f.state.connection!.accountId, "101");
  });

  it("rejects a stale settings save after a newer settings request completes", async (t) => {
    const f = fixture(t);
    let release!: (response: Response) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      calls += 1;
      if (calls === 1) {
        entered();
        return new Promise<Response>((resolve) => { release = resolve; });
      }
      return Response.json({ id: 202 });
    });
    const slowSave = saveTrading212Connection(replacement, f.db);
    await started;
    await saveTrading212Connection({ ...replacement, apiKey: "newer-test-key" }, f.db);
    const newestCiphertext = f.state.connection!.apiKeyEnc;
    release(Response.json({ id: 101 }));
    await assert.rejects(slowSave, /settings changed/);
    assert.equal(f.state.connection!.accountId, "202");
    assert.equal(f.state.connection!.apiKeyEnc, newestCiphertext);
  });

  it("does not revive a stale settings generation after switching away and back", async (t) => {
    const f = fixture(t);
    let release!: (response: Response) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      calls += 1;
      if (calls === 1) {
        entered();
        return new Promise<Response>((resolve) => { release = resolve; });
      }
      return Response.json({ id: calls === 2 ? 202 : 101 });
    });
    const slowSave = saveTrading212Connection(replacement, f.db);
    await started;
    await saveTrading212Connection({ ...replacement, environment: "demo", apiKey: "", apiSecret: "" }, f.db);
    await saveTrading212Connection({ ...replacement, apiKey: "", apiSecret: "" }, f.db);
    const latestCiphertext = f.state.connection!.apiKeyEnc;
    assert.equal(f.state.connection!.environment, f.connection.environment);
    assert.notEqual(latestCiphertext, f.connection.apiKeyEnc);
    release(Response.json({ id: 101 }));
    await assert.rejects(slowSave, /settings changed/);
    assert.equal(f.state.connection!.apiKeyEnc, latestCiphertext);
    assert.equal(f.state.connection!.accountId, "101");
  });

  it("discards an old sync and its error after an account switch", async (t) => {
    const f = fixture(t);
    summary(t, 202);
    await saveTrading212Connection(replacement, f.db);
    await assert.rejects(commitTrading212Sync({ userId: "user-1", connection: f.connection, positions: aapl, summary: { id: 101 } }, f.db), /changed while syncing/);
    await recordTrading212SyncError("user-1", f.connection, "stale failure", f.db);
    assert.equal(f.state.connection!.lastError, null);
    assert.equal(f.state.connection!.lastSyncAt, null);
    assert.deepEqual(f.state.holdings.map((row) => row.source), ["manual"]);
    assert.equal(f.state.snapshots.length, 0);
  });

  it("discards an old sync after disconnect and reconnect", async (t) => {
    const f = fixture(t);
    await disconnectTrading212ForUser("user-1", f.db);
    summary(t, 101);
    await saveTrading212Connection(replacement, f.db);
    await assert.rejects(commitTrading212Sync({ userId: "user-1", connection: f.connection, positions: aapl, summary: { id: 101 } }, f.db), /changed while syncing/);
    assert.equal(f.state.connection!.id, "connection-2");
    assert.deepEqual(f.state.holdings.map((row) => row.source), ["manual"]);
  });

  it("does not let an older same-generation sync overwrite a completed newer sync", async (t) => {
    const f = fixture(t);
    const input = { userId: "user-1", connection: f.connection, positions: aapl, summary: { id: 101, currency: "USD", investments: { currentValue: 400 } } };
    await commitTrading212Sync(input, f.db);
    await assert.rejects(commitTrading212Sync({ ...input, positions: [] , summary: { id: 101, investments: { currentValue: 0 } } }, f.db), /changed while syncing/);
    assert.ok(f.state.holdings.some((row) => row.symbolYahoo === "AAPL"));
    assert.equal(f.state.snapshots.length, 2);
  });

  it("removes sold broker positions after a complete empty response", async (t) => {
    const f = fixture(t);
    const synced = await commitTrading212Sync({ userId: "user-1", connection: f.connection, positions: [], summary: { id: 101, currency: "EUR", investments: { currentValue: 0 } } }, f.db);
    assert.equal(synced.positionsSynced, 0);
    assert.deepEqual(f.state.holdings.map((row) => row.source), ["manual"]);
    assert.equal(Number(f.state.snapshots.at(-1)!.totalValue), 0);
  });

  it("keeps holdings when empty positions contradict the broker summary", async (t) => {
    const f = fixture(t);
    await assert.rejects(commitTrading212Sync({ userId: "user-1", connection: f.connection, positions: [], summary: { id: 101, investments: { currentValue: 100 } } }, f.db), /reported investments/);
    assert.deepEqual(f.state.connection, f.connection);
    assert.equal(f.state.holdings.length, 2);
  });

  it("keeps existing history if a sync unexpectedly reports another account", async (t) => {
    const f = fixture(t);
    await assert.rejects(commitTrading212Sync({ userId: "user-1", connection: f.connection, positions: aapl, summary: { id: 202 } }, f.db), /different account/);
    assert.deepEqual(f.state.connection, f.connection);
    assert.equal(f.state.holdings.length, 2);
    assert.equal(f.state.snapshots.length, 1);
  });

  it("rejects incomplete credential pairs without changing saved data", async (t) => {
    const f = fixture(t);
    await assert.rejects(saveTrading212Connection({ ...replacement, apiSecret: "" }, f.db), /supplied together/);
    assert.deepEqual(f.state.connection, f.connection);
    assert.equal(f.state.holdings.length, 2);
  });

  it("rolls back connection metadata and holdings together if inserting positions fails", async (t) => {
    const f = fixture(t);
    f.state.failCreate = true;
    await assert.rejects(commitTrading212Sync({ userId: "user-1", connection: f.connection, positions: aapl, summary: { id: 101 } }, f.db), /Test insert failure/);
    assert.deepEqual(f.state.connection, f.connection);
    assert.equal(f.state.holdings.length, 2);
    assert.equal(f.state.snapshots.length, 1);
  });

  it("does not perform a destructive sync when the second positions page fails", async (t) => {
    const f = fixture(t);
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      calls += 1;
      return calls === 1 ? Response.json({ items: aapl, nextPagePath: "/api/v0/equity/positions?cursor=2" }) : new Response("error", { status: 500 });
    });
    await assert.rejects((async () => {
      const positions = await fetchT212Positions("live", "test-key", "test-secret");
      await commitTrading212Sync({ userId: "user-1", connection: f.connection, positions, summary: { id: 101 } }, f.db);
    })());
    assert.deepEqual(f.state.connection, f.connection);
    assert.equal(f.state.holdings.length, 2);
  });

  it("returns the new account's cache when an old dividend fetch completes after a switch", async (t) => {
    const f = fixture(t);
    let release!: (response: Response) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => {
      if (String(url).includes("/history/dividends")) {
        entered();
        return new Promise<Response>((resolve) => { release = resolve; });
      }
      return Response.json({ id: 202 });
    });
    const pending = refreshT212DividendsCache({ connectionId: f.connection.id, ...f.connection, maxPages: 1 }, f.db);
    await started;
    await saveTrading212Connection(replacement, f.db);
    release(Response.json({ items: [{ ticker: "OLD", paidOn: "2026-01-01", amount: 10 }], nextPagePath: null }));
    const result = await pending;
    assert.deepEqual(result.items, []);
    assert.equal(f.state.connection!.dividendsCache, null);
  });

  it("merges concurrent same-account dividend refreshes without losing either payment", async (t) => {
    const f = fixture(t);
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      calls += 1;
      return Response.json({ items: [{ ticker: `NEW${calls}`, paidOn: "2026-02-01", amount: calls }], nextPagePath: null });
    });
    const input = { ...f.connection, connectionId: f.connection.id, maxPages: 1 };
    await Promise.all([refreshT212DividendsCache(input, f.db), refreshT212DividendsCache(input, f.db)]);
    const cache = f.state.connection!.dividendsCache as Array<{ ticker: string }>;
    assert.deepEqual(cache.map((row) => row.ticker).sort(), ["NEW1", "NEW2", "OLD"]);
  });
});

describe("Trading 212 account IDs", () => {
  it("normalizes numeric IDs while rejecting missing, fractional and unsafe numbers", () => {
    assert.equal(t212AccountId({ id: 101 }), "101");
    assert.equal(t212AccountId({ id: "000101" }), "101");
    assert.equal(t212AccountId({ id: Number.MAX_SAFE_INTEGER + 1 }), null);
    assert.equal(t212AccountId({ id: 1.1 }), null);
    assert.equal(t212AccountId({ id: "invalid" }), null);
    assert.equal(t212AccountId(null), null);
  });
});
