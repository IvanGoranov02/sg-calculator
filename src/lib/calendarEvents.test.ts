import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  daysUntil,
  extractDividendPayDate,
  extractExDividendDate,
  extractSymbolEventRow,
  flattenUpcomingEvents,
  nextEarningsDate,
  unionEventSymbols,
} from "@/lib/calendarEvents";

const DAY = 86_400_000;

function isoDaysFromNow(n: number, now: number): string {
  return new Date(now + n * DAY).toISOString().slice(0, 10);
}

describe("nextEarningsDate", () => {
  it("picks the nearest upcoming earnings date", () => {
    const in10 = new Date(Date.now() + 10 * DAY);
    const in20 = new Date(Date.now() + 20 * DAY);
    const qs = {
      calendarEvents: {
        earnings: { earningsDate: [in10, in20] },
      },
    };
    assert.equal(nextEarningsDate(qs), in10.toISOString().slice(0, 10));
  });

  it("falls back to the most recent past date when none are upcoming", () => {
    const past = new Date(Date.now() - 30 * DAY);
    const qs = {
      calendarEvents: {
        earnings: { earningsDate: [past] },
      },
    };
    assert.equal(nextEarningsDate(qs), past.toISOString().slice(0, 10));
  });
});

describe("extractExDividendDate / extractDividendPayDate", () => {
  it("reads single calendar event dates from Yahoo shape", () => {
    const qs = {
      calendarEvents: {
        exDividendDate: new Date(Date.UTC(2026, 9, 10)),
        dividendDate: new Date(Date.UTC(2026, 9, 20)),
      },
    };
    assert.equal(extractExDividendDate(qs), "2026-10-10");
    assert.equal(extractDividendPayDate(qs), "2026-10-20");
  });

  it("returns null for missing or invalid dates", () => {
    assert.equal(extractExDividendDate({ calendarEvents: {} }), null);
    assert.equal(extractDividendPayDate({ calendarEvents: { dividendDate: "nope" } }), null);
  });
});

describe("extractSymbolEventRow", () => {
  it("combines all three event dates", () => {
    const row = extractSymbolEventRow(
      {
        calendarEvents: {
          earnings: { earningsDate: [new Date(Date.UTC(2026, 10, 1))] },
          exDividendDate: new Date(Date.UTC(2026, 8, 5)),
          dividendDate: new Date(Date.UTC(2026, 8, 15)),
        },
      },
      "AAPL",
      "Apple Inc.",
    );
    assert.deepEqual(row, {
      symbol: "AAPL",
      name: "Apple Inc.",
      earningsDate: "2026-11-01",
      exDividendDate: "2026-09-05",
      dividendPayDate: "2026-09-15",
    });
  });
});

describe("unionEventSymbols", () => {
  it("merges watchlist and portfolio symbols, deduplicated", () => {
    assert.deepEqual(unionEventSymbols(["aapl", "msft"], ["MSFT", "GOOG"]), ["AAPL", "MSFT", "GOOG"]);
  });

  it("skips blank entries", () => {
    assert.deepEqual(unionEventSymbols(["  ", "TSLA"], [""]), ["TSLA"]);
  });
});

describe("flattenUpcomingEvents", () => {
  const now = Date.UTC(2026, 8, 3);

  it("merges event kinds into one chronological list", () => {
    const { upcoming } = flattenUpcomingEvents(
      [
        {
          symbol: "A",
          name: "A",
          earningsDate: isoDaysFromNow(10, now),
          exDividendDate: isoDaysFromNow(3, now),
          dividendPayDate: null,
        },
        {
          symbol: "B",
          name: "B",
          earningsDate: isoDaysFromNow(5, now),
          exDividendDate: null,
          dividendPayDate: isoDaysFromNow(7, now),
        },
      ],
      2,
      now,
    );
    assert.equal(upcoming.length, 4);
    assert.deepEqual(
      upcoming.map((e) => [e.symbol, e.kind, e.days]),
      [
        ["A", "exDividend", 3],
        ["B", "earnings", 5],
        ["B", "dividendPay", 7],
        ["A", "earnings", 10],
      ],
    );
  });

  it("hides events older than the grace window", () => {
    const { upcoming, undated } = flattenUpcomingEvents(
      [
        {
          symbol: "OLD",
          name: "Old Co",
          earningsDate: isoDaysFromNow(-5, now),
          exDividendDate: isoDaysFromNow(-1, now),
          dividendPayDate: null,
        },
      ],
      2,
      now,
    );
    assert.equal(upcoming.length, 1);
    assert.equal(upcoming[0]?.kind, "exDividend");
    assert.equal(undated.length, 0);
  });

  it("lists symbols with no known events as undated", () => {
    const { upcoming, undated } = flattenUpcomingEvents(
      [{ symbol: "X", name: "X", earningsDate: null, exDividendDate: null, dividendPayDate: null }],
      2,
      now,
    );
    assert.equal(upcoming.length, 0);
    assert.deepEqual(undated, [{ symbol: "X", name: "X" }]);
  });
});

describe("daysUntil", () => {
  it("rounds to whole days from a fixed now", () => {
    const now = Date.UTC(2026, 0, 1, 12);
    assert.equal(daysUntil("2026-01-03", now), 2);
    assert.equal(daysUntil("2026-01-01", now), 0);
  });
});
