import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatLocaleDate,
  formatLocaleDateShort,
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

describe("formatLocaleDateShort", () => {
  it("formats short month and day with European preference", () => {
    const result = formatLocaleDateShort("2024-03-15T12:00:00Z", "en", "dmy");
    assert.match(result, /15/);
    assert.match(result, /Mar/i);
  });
});
