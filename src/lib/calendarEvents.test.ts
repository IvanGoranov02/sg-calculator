import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  daysUntil,
  extractDividendPayDate,
  extractExDividendDate,
  extractSymbolEventRow,
  flattenUpcomingEvents,
  formatDayGutter,
  formatEventRelativeDays,
  formatWeekRangeLabel,
  groupEventsByWeek,
  mondayOfWeek,
  nextEarningsDate,
  unionEventSymbols,
} from "@/lib/calendarEvents";

const DAY = 86_400_000;

/** Noon local on a calendar day — keeps flatten tests stable across timezones. */
function localNoon(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day, 12, 0, 0).getTime();
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
  const now = localNoon(2026, 9, 3);

  it("merges event kinds into one chronological list", () => {
    const { upcoming } = flattenUpcomingEvents(
      [
        {
          symbol: "A",
          name: "A",
          earningsDate: "2026-09-13",
          exDividendDate: "2026-09-06",
          dividendPayDate: null,
        },
        {
          symbol: "B",
          name: "B",
          earningsDate: "2026-09-08",
          exDividendDate: null,
          dividendPayDate: "2026-09-10",
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
          earningsDate: "2026-08-29",
          exDividendDate: "2026-09-02",
          dividendPayDate: null,
        },
      ],
      2,
      now,
    );
    assert.equal(upcoming.length, 1);
    assert.equal(upcoming[0]?.kind, "exDividend");
    assert.equal(upcoming[0]?.days, -1);
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
  it("rounds to whole local calendar days from a fixed now", () => {
    const now = localNoon(2026, 1, 1);
    assert.equal(daysUntil("2026-01-03", now), 2);
    assert.equal(daysUntil("2026-01-01", now), 0);
  });

  it("uses local calendar days at end of day, not UTC midnight parsing", () => {
    const evening = new Date(2026, 8, 3, 18, 0, 0).getTime();
    assert.equal(daysUntil("2026-09-03", evening), 0);
    assert.equal(daysUntil("2026-09-04", evening), 1);
    // Date.parse("2026-09-04") is UTC midnight; near local evening that can round to 0
    // while the calendar gutter still shows the 4th as tomorrow.
    const utcMidnightDays = Math.round((Date.parse("2026-09-04") - evening) / DAY);
    if (utcMidnightDays !== 1) {
      assert.notEqual(utcMidnightDays, daysUntil("2026-09-04", evening));
    }
  });
});

describe("formatEventRelativeDays", () => {
  const labels = {
    today: "Today",
    yesterday: "Yesterday",
    daysAgo: "{days} days ago",
    tomorrow: "Tomorrow",
    inDays: "in {days} days",
  };

  it("labels grace-window past events without calling them today", () => {
    assert.equal(formatEventRelativeDays(0, labels), "Today");
    assert.equal(formatEventRelativeDays(-1, labels), "Yesterday");
    assert.equal(formatEventRelativeDays(-2, labels), "2 days ago");
    assert.equal(formatEventRelativeDays(1, labels), "Tomorrow");
    assert.equal(formatEventRelativeDays(5, labels), "in 5 days");
  });
});

describe("groupEventsByWeek", () => {
  it("groups events by calendar week and day", () => {
    const events = [
      { symbol: "A", name: "A", kind: "earnings" as const, date: "2026-10-05", days: 2 },
      { symbol: "B", name: "B", kind: "exDividend" as const, date: "2026-10-05", days: 2 },
      { symbol: "C", name: "C", kind: "dividendPay" as const, date: "2026-10-07", days: 4 },
    ];
    const weeks = groupEventsByWeek(events);
    assert.equal(weeks.length, 1);
    assert.equal(weeks[0]?.weekStart, "2026-10-05");
    assert.equal(weeks[0]?.days.length, 2);
    assert.equal(weeks[0]?.days[0]?.events.length, 2);
    assert.equal(weeks[0]?.days[1]?.date, "2026-10-07");
  });
});

describe("formatWeekRangeLabel", () => {
  it("formats a single-month week range", () => {
    assert.equal(formatWeekRangeLabel("2026-10-05", "2026-10-11"), "OCT 5 – 11");
  });

  it("formats a cross-month week range", () => {
    assert.equal(formatWeekRangeLabel("2026-09-29", "2026-10-05"), "SEP 29 – OCT 5");
  });
});

describe("mondayOfWeek / formatDayGutter", () => {
  it("finds Monday for a mid-week date", () => {
    assert.equal(mondayOfWeek("2026-10-07"), "2026-10-05");
  });

  it("formats weekday and day for the gutter", () => {
    const gutter = formatDayGutter("2026-10-05", "en");
    assert.equal(gutter.weekday, "MON");
    assert.equal(gutter.day, 5);
  });
});
