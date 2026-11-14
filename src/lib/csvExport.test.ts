import assert from "node:assert/strict";
import test from "node:test";

import { toCsv } from "./csvExport";

test("toCsv quotes commas, quotes and newlines", () => {
  assert.equal(toCsv(["a", "b"], [["x,y", 'say "hi"'], ["l1\nl2", 3]]), 'a,b\r\n"x,y","say ""hi"""\r\n"l1\nl2",3');
});

test("toCsv blanks null, undefined and non-finite numbers", () => {
  assert.equal(toCsv(["a", "b", "c"], [[null, undefined, Number.NaN]]), "a,b,c\r\n,,");
});

test("toCsv defuses spreadsheet formulas but keeps negative numbers", () => {
  assert.equal(toCsv(["a"], [["=SUM(A1)"], ["-12.5"], [-3]]), "a\r\n'=SUM(A1)\r\n-12.5\r\n-3");
});
