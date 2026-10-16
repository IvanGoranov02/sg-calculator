import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSharedRequestCache, RequestCapacityError } from "@/lib/sharedRequestCache";

describe("shared public request cache", () => {
  it("deduplicates concurrent readers and reuses a completed response", async () => {
    const cached = createSharedRequestCache<number>({ ttlMs: 1_000, timeoutMs: 100 });
    let calls = 0;
    const load = async () => ++calls;
    const [a, b] = await Promise.all([cached("AAPL", load), cached("AAPL", load)]);
    assert.equal(a, 1);
    assert.equal(b, 1);
    assert.equal(await cached("AAPL", load), 1);
    assert.equal(calls, 1);
    assert.equal(await cached("MSFT", load), 2);
  });

  it("does not cache a failed request, allowing a later retry", async () => {
    const cached = createSharedRequestCache<number>({ ttlMs: 1_000, timeoutMs: 100 });
    await assert.rejects(cached("AAPL", async () => { throw new Error("offline"); }), /offline/);
    assert.equal(await cached("AAPL", async () => 2), 2);
  });

  it("keeps timed-out upstream work in the capacity and dedupe set until it stops", async () => {
    const cached = createSharedRequestCache<number>({ ttlMs: 0, timeoutMs: 10, maxEntries: 1 });
    let finish!: (value: number) => void;
    let calls = 0;
    const stalled = cached("AAPL", () => {
      calls += 1;
      return new Promise<number>((resolve) => { finish = resolve; });
    });
    await assert.rejects(cached("MSFT", async () => 1), RequestCapacityError);
    await assert.rejects(stalled, /timed out/);
    await assert.rejects(cached("AAPL", async () => ++calls), /timed out/);
    await assert.rejects(cached("MSFT", async () => 1), RequestCapacityError);
    assert.equal(calls, 1);
    finish(1);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(await cached("MSFT", async () => 2), 2);
  });
});
