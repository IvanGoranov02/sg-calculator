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

  it("maps Xetra Uber to UBER.DE with wallet-denominated broker price", () => {
    const p: T212Position = {
      instrument: { ticker: "UBERd_EQ", currency: "EUR" },
      quantity: 3,
      averagePricePaid: 68.5,
      currentPrice: 72.1,
      walletImpact: {
        currency: "EUR",
        currentValue: 216.3,
        totalCost: 205.5,
      },
    };
    const row = mapT212PositionToHolding(p, "user-1", "EUR");
    assert.ok(row);
    assert.equal(row.symbolYahoo, "UBER.DE");
    assert.equal(row.symbolT212, "UBERd_EQ");
    assert.equal(Number(row.quantity), 3);
    assert.equal(row.currency, "EUR");
    assert.equal(Number(row.brokerPrice), 72.1);
    assert.equal(Number(row.avgPrice), 68.5);
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

  it("reads ticker from the top-level field used by legacy portfolio payloads", () => {
    const row = mapT212PositionToHolding(
      {
        ticker: "TSLAd_EQ",
        quantity: 1,
        averagePrice: 220,
        currentPrice: 225,
        instrument: { currency: "EUR" },
        walletImpact: { currency: "EUR", currentValue: 225, totalCost: 220 },
      },
      "user-1",
      "EUR",
    );
    assert.ok(row);
    assert.equal(row.symbolT212, "TSLAd_EQ");
    assert.equal(row.symbolYahoo, "TL0.DE");
  });

  it("maps Xetra Apple local ticker and US-root ticker to APC.DE", () => {
    const local = mapT212PositionToHolding(
      {
        instrument: { ticker: "APCd_EQ", currency: "EUR" },
        quantity: 2,
        averagePricePaid: 170,
        currentPrice: 175,
        walletImpact: { currency: "EUR", currentValue: 350, totalCost: 340 },
      },
      "user-1",
      "EUR",
    );
    const usRoot = mapT212PositionToHolding(
      {
        instrument: { ticker: "AAPLd_EQ", currency: "EUR" },
        quantity: 2,
        averagePricePaid: 170,
        currentPrice: 175,
        walletImpact: { currency: "EUR", currentValue: 350, totalCost: 340 },
      },
      "user-1",
      "EUR",
    );
    assert.equal(local?.symbolYahoo, "APC.DE");
    assert.equal(usRoot?.symbolYahoo, "APC.DE");
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

  it("keeps Nasdaq and Xetra legs of the same US company as two rows", () => {
    const us = mapT212PositionToHolding(
      {
        instrument: { ticker: "AAPL_US_EQ", currency: "USD" },
        quantity: 2,
        averagePricePaid: 180,
        currentPrice: 190,
        walletImpact: { currency: "EUR", currentValue: 350, totalCost: 330 },
      },
      "user-1",
      "EUR",
    )!;
    const eu = mapT212PositionToHolding(
      {
        instrument: { ticker: "APCd_EQ", currency: "EUR" },
        quantity: 1,
        averagePricePaid: 175,
        currentPrice: 178,
        walletImpact: { currency: "EUR", currentValue: 178, totalCost: 175 },
      },
      "user-1",
      "EUR",
    )!;
    const uberUs = mapT212PositionToHolding(
      {
        instrument: { ticker: "UBER_US_EQ", currency: "USD" },
        quantity: 5,
        averagePricePaid: 80,
        currentPrice: 85,
        walletImpact: { currency: "EUR", currentValue: 390, totalCost: 370 },
      },
      "user-1",
      "EUR",
    )!;
    const uberEu = mapT212PositionToHolding(
      {
        instrument: { ticker: "UBERd_EQ", currency: "EUR" },
        quantity: 3,
        averagePricePaid: 68.5,
        currentPrice: 72.1,
        walletImpact: { currency: "EUR", currentValue: 216.3, totalCost: 205.5 },
      },
      "user-1",
      "EUR",
    )!;
    const merged = mergeT212HoldingRows([us, eu, uberUs, uberEu]);
    assert.equal(merged.length, 4);
    const byT212 = Object.fromEntries(merged.map((r) => [r.symbolT212, r]));
    assert.equal(byT212["AAPL_US_EQ"]?.symbolYahoo, "AAPL");
    assert.equal(byT212["APCd_EQ"]?.symbolYahoo, "APC.DE");
    assert.equal(byT212["UBER_US_EQ"]?.symbolYahoo, "UBER");
    assert.equal(byT212["UBERd_EQ"]?.symbolYahoo, "UBER.DE");
    assert.equal(Number(byT212["UBERd_EQ"]?.quantity), 3);
  });

  it("does not drop an EU listing when Yahoo keys would collide", () => {
    const a = mapT212PositionToHolding(
      {
        instrument: { ticker: "UBER_US_EQ", currency: "USD" },
        quantity: 1,
        averagePricePaid: 80,
        currentPrice: 85,
        walletImpact: { currency: "EUR", currentValue: 78, totalCost: 74 },
      },
      "user-1",
      "EUR",
    )!;
    const b = {
      ...mapT212PositionToHolding(
        {
          instrument: { ticker: "UBERd_EQ", currency: "EUR" },
          quantity: 3,
          averagePricePaid: 70,
          currentPrice: 72,
          walletImpact: { currency: "EUR", currentValue: 216, totalCost: 210 },
        },
        "user-1",
        "EUR",
      )!,
      symbolYahoo: "UBER",
    };
    const merged = mergeT212HoldingRows([a, b]);
    assert.equal(merged.length, 2);
    const yahoos = merged.map((r) => r.symbolYahoo).sort();
    assert.deepEqual(yahoos, ["UBER", "UBER.DE"]);
  });
});
