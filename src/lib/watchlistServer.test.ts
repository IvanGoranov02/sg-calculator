import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mutateSavedWatchlist,
  parseWatchlistMutation,
  replaceSavedWatchlist,
  type WatchlistStore,
  type WatchlistTransaction,
} from "@/lib/watchlistServer";

/** Transaction callbacks run concurrently; only an explicit user lock serializes their reads. */
class LockedMemoryWatchlists implements WatchlistStore {
  readonly lists = new Map<string, string[]>();
  transactionCalls = 0;
  writes = 0;
  private readonly locks = new Map<string, Promise<void>>();

  constructor(symbols: string[] = []) {
    this.lists.set("user", symbols);
  }

  async transaction<T>(work: (tx: WatchlistTransaction) => Promise<T>): Promise<T> {
    this.transactionCalls += 1;
    let lockedUser: string | null = null;
    let release: (() => void) | undefined;
    const tx: WatchlistTransaction = {
      lockUser: async (userId) => {
        assert.equal(lockedUser, null);
        const previous = this.locks.get(userId) ?? Promise.resolve();
        const held = new Promise<void>((resolve) => { release = resolve; });
        this.locks.set(userId, previous.then(() => held));
        await previous;
        lockedUser = userId;
        return this.lists.has(userId);
      },
      readSymbols: async (userId) => {
        assert.equal(lockedUser, userId, "must lock before reading another tab's saved list");
        // Yield so concurrently started callbacks would overlap without the lock.
        await Promise.resolve();
        return [...(this.lists.get(userId) ?? [])];
      },
      replaceSymbols: async (userId, symbols) => {
        assert.equal(lockedUser, userId, "must retain the user lock while writing");
        this.writes += 1;
        this.lists.set(userId, [...symbols]);
      },
    };
    try {
      return await work(tx);
    } finally {
      release?.();
    }
  }
}

describe("atomic saved watchlist actions", () => {
  it("preserves both additions from two concurrently started browser tabs", async () => {
    const store = new LockedMemoryWatchlists(["MSFT"]);
    const [first, second] = await Promise.all([
      mutateSavedWatchlist(store, "user", { action: "add", symbol: " aapl " }),
      mutateSavedWatchlist(store, "user", { action: "add", symbol: "GOOGL" }),
    ]);
    assert.deepEqual(first, { status: 200, body: { symbols: ["MSFT", "AAPL"] } });
    assert.deepEqual(second, { status: 200, body: { symbols: ["MSFT", "AAPL", "GOOGL"] } });
    assert.deepEqual(store.lists.get("user"), ["MSFT", "AAPL", "GOOGL"]);
  });

  it("deduplicates concurrent additions of the same normalized symbol", async () => {
    const store = new LockedMemoryWatchlists();
    await Promise.all([
      mutateSavedWatchlist(store, "user", { action: "add", symbol: "aapl" }),
      mutateSavedWatchlist(store, "user", { action: "add", symbol: "AAPL" }),
    ]);
    assert.deepEqual(store.lists.get("user"), ["AAPL"]);
    assert.equal(store.writes, 1);
  });

  it("does not wipe the list for malformed PATCH or legacy PUT input", async () => {
    const store = new LockedMemoryWatchlists(["MSFT"]);
    for (const raw of [null, [], {}, { symbols: [] }, { action: "clear" }, { action: "add" },
      { action: "add", symbol: 42 }, { action: "remove", symbol: " " },
      { action: "addMany", symbols: "AAPL" }, { action: "addMany", symbols: ["AAPL", null] }]) {
      assert.equal((await mutateSavedWatchlist(store, "user", raw)).status, 400);
    }
    for (const raw of [null, {}, { symbols: "AAPL" }, { symbols: ["AAPL", 42] }, { symbols: [" "] }]) {
      assert.equal((await replaceSavedWatchlist(store, "user", raw)).status, 400);
    }
    assert.deepEqual(store.lists.get("user"), ["MSFT"]);
    assert.equal(store.transactionCalls, 0);
    assert.equal(store.writes, 0);
  });

  it("enforces 50 symbols atomically when two tabs compete for the last slot", async () => {
    const baseline = Array.from({ length: 49 }, (_, i) => `S${i}`);
    const store = new LockedMemoryWatchlists(baseline);
    const results = await Promise.all([
      mutateSavedWatchlist(store, "user", { action: "add", symbol: "AAPL" }),
      mutateSavedWatchlist(store, "user", { action: "add", symbol: "MSFT" }),
    ]);
    assert.deepEqual(results.map((result) => result.status), [200, 409]);
    const saved = [...baseline, "AAPL"];
    assert.deepEqual(store.lists.get("user"), saved);
    assert.deepEqual(results[1].body.symbols, saved);
    assert.equal(store.writes, 1);
  });

  it("merges addMany with committed symbols and rejects overflow without a partial write", async () => {
    const store = new LockedMemoryWatchlists(["MSFT"]);
    const added = await mutateSavedWatchlist(store, "user", { action: "addMany", symbols: ["AAPL", " msft ", "aapl"] });
    assert.deepEqual(added.body.symbols, ["MSFT", "AAPL"]);
    const overflow = await mutateSavedWatchlist(store, "user", {
      action: "addMany", symbols: Array.from({ length: 50 }, (_, i) => `S${i}`),
    });
    assert.equal(overflow.status, 409);
    assert.deepEqual(overflow.body.symbols, ["MSFT", "AAPL"]);
    assert.deepEqual(store.lists.get("user"), ["MSFT", "AAPL"]);
    assert.equal(store.writes, 1);
  });

  it("makes remove idempotent and serializes concurrent toggles", async () => {
    const store = new LockedMemoryWatchlists(["MSFT"]);
    await mutateSavedWatchlist(store, "user", { action: "remove", symbol: "AAPL" });
    assert.equal(store.writes, 0);
    await Promise.all([
      mutateSavedWatchlist(store, "user", { action: "toggle", symbol: "AAPL" }),
      mutateSavedWatchlist(store, "user", { action: "toggle", symbol: "AAPL" }),
    ]);
    assert.deepEqual(store.lists.get("user"), ["MSFT"]);
    const removed = await mutateSavedWatchlist(store, "user", { action: "remove", symbol: "MSFT" });
    assert.deepEqual(removed.body.symbols, []);
  });

  it("retains explicit validated PUT replacement and clearing", async () => {
    const store = new LockedMemoryWatchlists(["MSFT"]);
    assert.deepEqual(await replaceSavedWatchlist(store, "user", { symbols: [" aapl ", "AAPL"] }), {
      status: 200, body: { symbols: ["AAPL"] },
    });
    assert.deepEqual(await replaceSavedWatchlist(store, "user", { symbols: [] }), {
      status: 200, body: { symbols: [] },
    });
  });

  it("does not create rows for a deleted user", async () => {
    const store = new LockedMemoryWatchlists();
    store.lists.delete("user");
    const result = await mutateSavedWatchlist(store, "user", { action: "add", symbol: "AAPL" });
    assert.equal(result.status, 404);
    assert.equal(store.writes, 0);
  });
});

describe("parseWatchlistMutation", () => {
  it("rejects oversized bulk input before opening a transaction", () => {
    assert.equal(parseWatchlistMutation({ action: "addMany", symbols: Array.from({ length: 51 }, (_, i) => `S${i}`) }), null);
  });
});
