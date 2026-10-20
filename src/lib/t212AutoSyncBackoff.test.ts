import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clearAutoSyncFailure, recordAutoSyncFailure, shouldAttemptAutoSync } from "@/lib/t212AutoSyncBackoff";

const backoffMs = 10 * 60 * 1000;

describe("T212 automatic sync backoff", () => {
  it("allows new users and isolates failures by user", () => {
    assert.equal(shouldAttemptAutoSync("new", 0), true);
    recordAutoSyncFailure("failed", 0);
    assert.equal(shouldAttemptAutoSync("failed", backoffMs - 1), false);
    assert.equal(shouldAttemptAutoSync("other", 0), true);
    assert.equal(shouldAttemptAutoSync("failed", backoffMs), true);
    clearAutoSyncFailure("failed");
  });

  it("clears a failure after success", () => {
    recordAutoSyncFailure("cleared", 100);
    clearAutoSyncFailure("cleared");
    assert.equal(shouldAttemptAutoSync("cleared", 101), true);
  });

  it("restarts the window after another failure", () => {
    recordAutoSyncFailure("retry", 0);
    recordAutoSyncFailure("retry", backoffMs);
    assert.equal(shouldAttemptAutoSync("retry", 2 * backoffMs - 1), false);
    assert.equal(shouldAttemptAutoSync("retry", 2 * backoffMs), true);
    clearAutoSyncFailure("retry");
  });

  it("prunes expired entries when recording a failure", () => {
    recordAutoSyncFailure("expired", 0);
    recordAutoSyncFailure("fresh", backoffMs);
    assert.equal(shouldAttemptAutoSync("expired", 0), true);
    clearAutoSyncFailure("fresh");
  });

  it("caps failures at 1000 entries and evicts the oldest", () => {
    for (let i = 0; i <= 1000; i++) recordAutoSyncFailure(`bounded-${i}`, i);
    assert.equal(shouldAttemptAutoSync("bounded-0", 1000), true);
    assert.equal(shouldAttemptAutoSync("bounded-1", 1000), false);
    assert.equal(shouldAttemptAutoSync("bounded-1000", 1000), false);
    for (let i = 0; i <= 1000; i++) clearAutoSyncFailure(`bounded-${i}`);
  });
});
