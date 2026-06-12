import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkRateLimit, clientKeyFromRequest } from "@/lib/rateLimit";

describe("checkRateLimit", () => {
  it("allows up to the limit within a window, then blocks with retry info", () => {
    const key = `test-${Date.now()}-a`;
    assert.equal(checkRateLimit("t", key, 2, 60_000).ok, true);
    assert.equal(checkRateLimit("t", key, 2, 60_000).ok, true);
    const third = checkRateLimit("t", key, 2, 60_000);
    assert.equal(third.ok, false);
    if (!third.ok) assert.ok(third.retryAfterSec >= 1);
  });

  it("resets after the window expires", async () => {
    const key = `test-${Date.now()}-b`;
    assert.equal(checkRateLimit("t", key, 1, 20).ok, true);
    assert.equal(checkRateLimit("t", key, 1, 20).ok, false);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(checkRateLimit("t", key, 1, 20).ok, true);
  });

  it("tracks keys independently", () => {
    const a = `test-${Date.now()}-c1`;
    const b = `test-${Date.now()}-c2`;
    assert.equal(checkRateLimit("t", a, 1, 60_000).ok, true);
    assert.equal(checkRateLimit("t", b, 1, 60_000).ok, true);
    assert.equal(checkRateLimit("t", a, 1, 60_000).ok, false);
  });
});

describe("clientKeyFromRequest", () => {
  it("prefers the signed-in user id", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4" } });
    assert.equal(clientKeyFromRequest(req, "u1"), "user:u1");
  });

  it("falls back to the first forwarded IP", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
    });
    assert.equal(clientKeyFromRequest(req, null), "ip:1.2.3.4");
  });

  it("returns a shared anon key without any client hints", () => {
    assert.equal(clientKeyFromRequest(new Request("http://x")), "anon");
  });
});
