import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { initialPortfolioReady } from "@/lib/eventsSession";

describe("initialPortfolioReady", () => {
  it("is false while session is loading or authenticated", () => {
    assert.equal(initialPortfolioReady("loading"), false);
    assert.equal(initialPortfolioReady("authenticated"), false);
  });

  it("is true only for unauthenticated guests", () => {
    assert.equal(initialPortfolioReady("unauthenticated"), true);
  });
});
