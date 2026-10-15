import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWatchlistMutations } from "@/lib/watchlistMutations";

describe("cloud watchlist writes", () => {
  it("adopts atomic server results including changes made in another tab", async () => {
    const writes: string[][] = [];
    let saved: string[] = [];
    const mutations = createWatchlistMutations({ symbols: ["AAPL"],
      save: async (symbols) => { writes.push(symbols); return { symbols: [...new Set([...symbols, "GOOG"])] }; },
      onSaved: (symbols) => { saved = symbols; }, onError: () => assert.fail("unexpected error") });
    await mutations.mutate("add", "MSFT");
    await mutations.mutate("add", "TSLA");
    assert.deepEqual(writes[1], ["AAPL", "MSFT", "GOOG", "TSLA"]);
    assert.deepEqual(saved, ["AAPL", "MSFT", "GOOG", "TSLA"]);
  });
  it("preserves two rapid additions and a removal while a write is pending", async () => {
    let saved: string[] = [];
    const writes: string[][] = [];
    const mutations = createWatchlistMutations({
      symbols: ["AAPL"],
      save: async (symbols) => { writes.push(symbols); await new Promise((r) => setTimeout(r, 5)); return true; },
      onSaved: (symbols) => { saved = symbols; },
      onError: () => assert.fail("unexpected write failure"),
    });
    await Promise.all([mutations.mutate("add", "MSFT"), mutations.mutate("add", "GOOG"), mutations.mutate("remove", "AAPL")]);
    assert.deepEqual(writes, [["AAPL", "MSFT"], ["AAPL", "MSFT", "GOOG"], ["MSFT", "GOOG"]]);
    assert.deepEqual(saved, ["MSFT", "GOOG"]);
  });

  it("does not build later writes on a failed update", async () => {
    let count = 0;
    let errors = 0;
    let saved: string[] = [];
    const mutations = createWatchlistMutations({
      symbols: ["AAPL"], save: async () => { if (++count === 1) throw new Error("offline"); return true; },
      onSaved: (symbols) => { saved = symbols; }, onError: () => { errors++; },
    });
    assert.equal(await mutations.mutate("add", "MSFT"), false);
    assert.equal(await mutations.mutate("add", "GOOG"), true);
    assert.deepEqual(saved, ["AAPL", "GOOG"]);
    assert.equal(errors, 1);
  });

  it("abandons queued actions and state updates after the account changes", async () => {
    let release!: (ok: boolean) => void;
    const calls: string[][] = [];
    const mutations = createWatchlistMutations({
      symbols: ["AAPL"], save: (symbols) => { calls.push(symbols); return new Promise((r) => { release = r; }); },
      onSaved: () => assert.fail("previous account updated state"), onError: () => assert.fail("unexpected error"),
    });
    const first = mutations.mutate("add", "MSFT");
    const second = mutations.mutate("add", "GOOG");
    await Promise.resolve();
    mutations.deactivate(); release(true);
    assert.deepEqual(await Promise.all([first, second]), [false, false]);
    assert.equal(calls.length, 1);
  });
});
