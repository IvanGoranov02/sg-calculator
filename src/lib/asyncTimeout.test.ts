import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fetchWithTimeout,
  isTimeoutError,
  TimeoutError,
  withRetry,
  withTimeout,
  withTimeoutFallback,
} from "@/lib/asyncTimeout";

describe("withTimeout", () => {
  it("resolves when the work finishes in time", async () => {
    const v = await withTimeout(Promise.resolve(7), 50, "ok");
    assert.equal(v, 7);
  });

  it("rejects with TimeoutError when the work is too slow", async () => {
    await assert.rejects(
      () => withTimeout(new Promise(() => undefined), 20, "slow-step"),
      (e: unknown) => {
        assert.equal(isTimeoutError(e), true);
        assert.ok(e instanceof TimeoutError);
        assert.match(e.message, /slow-step timed out after 20ms/);
        return true;
      },
    );
  });

  it("rejects immediately on a non-positive timeout", async () => {
    await assert.rejects(() => withTimeout(Promise.resolve(1), 0, "x"), RangeError);
  });
});

describe("withTimeoutFallback", () => {
  it("returns the fallback on timeout and rethrows other errors", async () => {
    const fallback = await withTimeoutFallback(new Promise<number>(() => undefined), 15, "fb", 99);
    assert.equal(fallback, 99);
    await assert.rejects(
      () => withTimeoutFallback(Promise.reject(new Error("boom")), 50, "fb", 0),
      /boom/,
    );
  });
});

describe("withRetry", () => {
  it("retries timeouts then succeeds", async () => {
    let n = 0;
    const v = await withRetry(
      async () => {
        n += 1;
        if (n < 3) {
          await new Promise(() => undefined);
        }
        return "ok";
      },
      { attempts: 3, timeoutMs: 25, label: "flaky", delayMs: 0 },
    );
    assert.equal(v, "ok");
    assert.equal(n, 3);
  });

  it("stops when retryIf returns false", async () => {
    let n = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            n += 1;
            throw new Error("fatal");
          },
          {
            attempts: 5,
            timeoutMs: 50,
            label: "no-retry",
            retryIf: () => false,
          },
        ),
      /fatal/,
    );
    assert.equal(n, 1);
  });
});

describe("fetchWithTimeout", () => {
  it("returns a fetch-compatible function and rejects a non-positive timeout", () => {
    const timed = fetchWithTimeout(25);
    assert.equal(typeof timed, "function");
    assert.throws(() => fetchWithTimeout(0), RangeError);
  });
});
