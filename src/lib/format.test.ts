import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatCurrency,
  formatCurrencyPerShare,
  formatLocaleDate,
  formatLocaleDateShort,
  intlCurrencyCode,
  resolveDateLocaleTag,
} from "./format";

describe("resolveDateLocaleTag", () => {
  it("maps European format to en-GB for English", () => {
    assert.equal(resolveDateLocaleTag("en", "dmy"), "en-GB");
  });

  it("maps American format to en-US for English", () => {
    assert.equal(resolveDateLocaleTag("en", "mdy"), "en-US");
  });

  it("uses bg-BG for Bulgarian with European format", () => {
    assert.equal(resolveDateLocaleTag("bg", "dmy"), "bg-BG");
  });
});

describe("formatLocaleDate", () => {
  it("formats European DD/MM/YYYY", () => {
    assert.equal(formatLocaleDate("2024-03-15", "en", "dmy"), "15/03/2024");
  });

  it("formats American MM/DD/YYYY", () => {
    assert.equal(formatLocaleDate("2024-03-15", "en", "mdy"), "3/15/2024");
  });

  it("returns dash for invalid input", () => {
    assert.equal(formatLocaleDate(null, "en", "mdy"), "—");
  });
});

describe("formatCurrencyPerShare", () => {
  it("labels US listings in dollars", () => {
    assert.match(formatCurrencyPerShare(0.525), /^\$0\.525/);
    assert.match(formatCurrency(2.1), /^\$2\.10/);
  });

  it("labels euro listing cash with the euro symbol", () => {
    assert.match(formatCurrencyPerShare(0.461, "EUR"), /^€0\.461/);
    assert.match(formatCurrency(1.83, "EUR"), /^€1\.83/);
  });

  it("formats pence quotes as pounds after dividing by 100", () => {
    assert.equal(intlCurrencyCode("GBp"), "GBP");
    assert.equal(intlCurrencyCode("GBX"), "GBP");
    // VOD.L latest ex-div is ~2.03 pence. Relabeling GBp as GBP without /100 showed £2.03.
    assert.match(formatCurrencyPerShare(2.03, "GBp"), /^£0\.0203/);
    assert.match(formatCurrencyPerShare(2.0267887, "GBX"), /^£0\.0203/);
    assert.doesNotMatch(formatCurrencyPerShare(2.03, "GBp"), /^£2/);
  });
});

describe("formatLocaleDateShort", () => {
  it("formats short month and day with European preference", () => {
    const result = formatLocaleDateShort("2024-03-15T12:00:00Z", "en", "dmy");
    assert.match(result, /15/);
    assert.match(result, /Mar/i);
  });
});
