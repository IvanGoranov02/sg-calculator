import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mapT212PositionToHolding, mergeT212HoldingRows } from "@/lib/t212PositionSync";
import type { T212Position } from "@/lib/trading212Client";

describe("mapT212PositionToHolding", () => {
  it("stores wallet-denominated broker/avg for cross-currency US stock in EUR account", () => {
    const p: T212Position = {
      instrument: { ticker: "META_US_EQ", currency: "USD" },
      quantity: 2,
      averagePricePaid: 500,
      currentPrice: 585,
      walletImpact: {
        currency: "EUR",
        currentValue: 1070,
        totalCost: 920,
      },
    };
    const row = mapT212PositionToHolding(p, "user-1", "EUR");
    assert.ok(row);
    assert.equal(row.symbolYahoo, "META");
    assert.equal(row.symbolT212, "META_US_EQ");
    assert.equal(row.currency, "EUR");
    assert.equal(Number(row.brokerPrice), 535);
    assert.equal(Number(row.avgPrice), 460);
  });

  it("keeps instrument currency prices for same-currency Xetra listings", () => {
    const p: T212Position = {
      instrument: { ticker: "FB2Ad_EQ", currency: "EUR" },
      quantity: 1,
      averagePricePaid: 480,
      currentPrice: 526,
      walletImpact: {
        currency: "EUR",
        currentValue: 526,
        totalCost: 480,
      },
    };
    const row = mapT212PositionToHolding(p, "user-1", "EUR");
    assert.ok(row);
    assert.equal(row.symbolYahoo, "FB2A.DE");
    assert.equal(row.currency, "EUR");
    assert.equal(Number(row.brokerPrice), 526);
    assert.equal(Number(row.avgPrice), 480);
  });

  it("normalizes GBp instrument prices to GBP", () => {
    const p: T212Position = {
      instrument: { ticker: "BPl_EQ", currency: "GBX" },
      quantity: 10,
      averagePricePaid: 450,
      currentPrice: 539.7,
      walletImpact: {
        currency: "GBP",
        currentValue: 53.97,
        totalCost: 45,
      },
    };
    const row = mapT212PositionToHolding(p, "user-1", "GBP");
    assert.ok(row);
    assert.equal(row.currency, "GBP");
    assert.equal(Number(row.brokerPrice), 5.397);
    assert.equal(Number(row.avgPrice), 4.5);
  });

  it("skips zero-quantity positions", () => {
    const row = mapT212PositionToHolding(
      { instrument: { ticker: "AAPL_US_EQ" }, quantity: 0 },
      "user-1",
      "USD",
    );
    assert.equal(row, null);
  });
});

describe("mergeT212HoldingRows", () => {
  it("combines duplicate Yahoo symbols and keeps the larger line's T212 ticker", () => {
    const a = mapT212PositionToHolding(
      {
        instrument: { ticker: "MSFTd_EQ", currency: "EUR" },
        quantity: 1,
        averagePricePaid: 400,
        currentPrice: 430,
        walletImpact: { currency: "EUR", currentValue: 430, totalCost: 400 },
      },
      "user-1",
      "EUR",
    )!;
    const b = mapT212PositionToHolding(
      {
        instrument: { ticker: "MSFTd_EQ", currency: "EUR" },
        quantity: 3,
        averagePricePaid: 420,
        currentPrice: 431,
        walletImpact: { currency: "EUR", currentValue: 1293, totalCost: 1260 },
      },
      "user-1",
      "EUR",
    )!;
    const merged = mergeT212HoldingRows([a, b]);
    assert.equal(merged.length, 1);
    assert.equal(Number(merged[0]!.quantity), 4);
    assert.equal(merged[0]!.symbolT212, "MSFTd_EQ");
  });
});
