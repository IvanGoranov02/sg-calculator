import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isTrading212AuthFailure,
  looksLikeTrading212ErrorMessage,
  normalizeTrading212ErrorMessage,
  trading212UserErrorMessage,
} from "@/lib/trading212Errors";

describe("trading212UserErrorMessage", () => {
  it("explains 401 for reconnect", () => {
    const msg = trading212UserErrorMessage(401);
    assert.match(msg, /unauthorized/i);
    assert.match(msg, /reconnect/i);
  });
});

describe("normalizeTrading212ErrorMessage", () => {
  it("rewrites legacy Trading 212 401 strings", () => {
    const msg = normalizeTrading212ErrorMessage("Trading 212 401: Unauthorized");
    assert.ok(msg);
    assert.match(msg, /rejected the saved API credentials/i);
  });
});

describe("isTrading212AuthFailure", () => {
  it("detects status 401", () => {
    assert.equal(isTrading212AuthFailure(401, null), true);
  });

  it("detects legacy message", () => {
    assert.equal(isTrading212AuthFailure(null, "Trading 212 401"), true);
  });
});

describe("looksLikeTrading212ErrorMessage", () => {
  it("matches broker prefix", () => {
    assert.equal(looksLikeTrading212ErrorMessage("Trading 212 502: bad gateway"), true);
    assert.equal(looksLikeTrading212ErrorMessage("Yahoo failed"), false);
  });
});
