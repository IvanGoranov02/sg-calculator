import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildDividendSeed, dividendCagrFromEvents, fetchDividendSeed, type DividendEvent } from "@/lib/yahooDividendSeed";
import { yahooFinance } from "@/lib/yahooFinanceClient";

function quarterlyPayments(startYear: number, endYear: number, growth = 0): DividendEvent[] {
  return Array.from({ length: endYear - startYear + 1 }, (_, i) =>
    ["03-15", "06-15", "09-15", "12-15"].map((day) => ({
      date: `${startYear + i}-${day}`, amount: (1 + growth) ** i,
    }))).flat();
}

describe("dividendCagrFromEvents", () => {
  it("ignores the first partial request year and returns zero for constant payments", () => {
    const start = new Date("2018-10-14T00:00:00Z");
    const end = new Date("2026-10-14T00:00:00Z");
    const events = quarterlyPayments(2018, 2026).filter((e) => new Date(String(e.date)) >= start);
    assert.equal(dividendCagrFromEvents(events, start, end), 0);
  });

  it("uses fully covered years for real dividend growth", () => {
    const growth = dividendCagrFromEvents(
      quarterlyPayments(2018, 2026, 0.05),
      new Date("2018-10-14T00:00:00Z"), new Date("2026-10-14T00:00:00Z"),
    );
    assert.ok(Math.abs((growth ?? 0) - 0.05) < 1e-10);
  });

  it("requires at least three complete years", () => {
    assert.equal(dividendCagrFromEvents(
      quarterlyPayments(2023, 2026),
      new Date("2023-10-14T00:00:00Z"), new Date("2026-10-14T00:00:00Z"),
    ), null);
  });

  it("accepts Unix seconds and includes a full first year requested from January 1", () => {
    const events = quarterlyPayments(2020, 2023, 0.1).map((e) => ({
      ...e, date: new Date(String(e.date)).getTime() / 1000,
    }));
    const growth = dividendCagrFromEvents(events, new Date("2020-01-01"), new Date("2024-01-01"));
    assert.ok(Math.abs((growth ?? 0) - 0.1) < 1e-10);
  });
});

describe("dividend seed currency", () => {
  const start = new Date("2018-10-14");
  const end = new Date("2026-10-14");

  it("normalizes a London quote to pounds while keeping Yahoo's pound annual rate", () => {
    const seed = buildDividendSeed("ULVR.L", {
      currency: "GBp", regularMarketPrice: 5000, dividendRate: 1.6, dividendYield: 3.2,
    }, quarterlyPayments(2018, 2026).map((e) => ({ ...e, amount: 40 })), start, end);
    assert.ok(seed);
    assert.equal(seed?.currency, "GBP");
    assert.equal(seed?.currentPrice, 50);
    assert.equal(seed?.annualDividendPerShare, 1.6);
    assert.equal(seed?.dividendYield, 0.032);
    assert.equal(seed.annualDividendPerShare / seed.currentPrice, 0.032);
    assert.equal(seed?.suggestedGrowthPct, 0);
  });

  it("normalizes a Yahoo annual rate reported in pence when pounds imply an impossible yield", () => {
    const seed = buildDividendSeed("ULVR.L", {
      currency: "GBp", regularMarketPrice: 5000, dividendRate: 160,
    }, [], start, end);
    assert.equal(seed?.annualDividendPerShare, 1.6);
    assert.equal(seed?.currentPrice, 50);
  });

  it("preserves a Canadian listing currency and falls back to a trailing annual rate", () => {
    const seed = buildDividendSeed("TD.TO", {
      currency: "CAD", regularMarketPrice: 100, trailingAnnualDividendRate: 4,
    }, [], start, end);
    assert.equal(seed?.currency, "CAD");
    assert.equal(seed?.currentPrice, 100);
    assert.equal(seed?.annualDividendPerShare, 4);
  });

  it("keeps the fetched quote usable when optional dividend history fails", async (t) => {
    const client = yahooFinance as unknown as {
      quote: (...args: unknown[]) => Promise<unknown>;
      chart: (...args: unknown[]) => Promise<unknown>;
    };
    t.mock.method(client, "quote", async () => ({
      symbol: "ULVR.L", currency: "GBp", regularMarketPrice: 5000, dividendRate: 1.6,
    }));
    const chart = t.mock.method(client, "chart", async () => { throw new Error("History unavailable"); });
    const seed = await fetchDividendSeed(" ulvr.l ");
    assert.equal(seed?.symbol, "ULVR.L");
    assert.equal(seed?.currency, "GBP");
    assert.equal(seed?.currentPrice, 50);
    assert.equal(seed?.annualDividendPerShare, 1.6);
    assert.equal(seed?.growthFromHistory, false);
    assert.equal(seed?.suggestedGrowthPct, 6);
    assert.equal(chart.mock.calls.length, 1);
  });
});
