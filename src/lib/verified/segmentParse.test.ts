import assert from "node:assert/strict";
import { test } from "node:test";

import { chooseBreakdown, deriveFourthQuarters, extractPeriods, fallbackMemberName, parseInstance, parseMemberLabels } from "./segmentParse";

const PRODUCT = "srt:ProductOrServiceAxis";
const SEGMENT = "us-gaap:StatementBusinessSegmentsAxis";

function context(id: string, start: string, end: string, dims: [string, string][] = []): string {
  const seg = dims.length
    ? `<segment>${dims.map(([axis, m]) => `<xbrldi:explicitMember dimension="${axis}">${m}</xbrldi:explicitMember>`).join("")}</segment>`
    : "";
  return `<context id="${id}"><entity><identifier scheme="x">1</identifier>${seg}</entity><period><startDate>${start}</startDate><endDate>${end}</endDate></period></context>`;
}
const fact = (ctx: string, value: number, concept = "Revenues") => `<us-gaap:${concept} contextRef="${ctx}" unitRef="usd" decimals="-6">${value}</us-gaap:${concept}>`;

/** A quarter and its prior-year comparative: Search + YouTube (nested in a segment) + Cloud + a sub-total. */
function filing(): string {
  const q = (tag: string, start: string, end: string, v: { search: number; yt: number; cloud: number }) =>
    [
      context(`t${tag}`, start, end),
      context(`s${tag}`, start, end, [[SEGMENT, "x:ServicesMember"], [PRODUCT, "x:SearchMember"]]),
      context(`y${tag}`, start, end, [[SEGMENT, "x:ServicesMember"], [PRODUCT, "x:YouTubeAdsMember"]]),
      context(`a${tag}`, start, end, [[SEGMENT, "x:ServicesMember"], [PRODUCT, "x:AdvertisingMember"]]),
      context(`v${tag}`, start, end, [[SEGMENT, "x:ServicesMember"]]),
      context(`c${tag}`, start, end, [[SEGMENT, "x:CloudMember"]]),
      context(`g${tag}`, start, end, [["srt:StatementGeographicalAxis", "country:US"]]),
      fact(`t${tag}`, v.search + v.yt + v.cloud),
      fact(`s${tag}`, v.search),
      fact(`y${tag}`, v.yt),
      fact(`a${tag}`, v.search + v.yt),
      fact(`v${tag}`, v.search + v.yt),
      fact(`c${tag}`, v.cloud),
      fact(`g${tag}`, v.cloud),
    ].join("");
  return `<xbrl>${q("1", "2026-07-01", "2026-09-30", { search: 600, yt: 100, cloud: 300 })}${q("0", "2025-07-01", "2025-09-30", { search: 500, yt: 80, cloud: 200 })}</xbrl>`;
}

test("picks the finest breakdown that adds up, across both axes, without sub-totals", () => {
  const parsed = parseInstance(filing());
  const keys = chooseBreakdown(parsed, "2026-09-30");
  assert.deepEqual([...(keys ?? [])].sort(), [`${PRODUCT}|x:SearchMember`, `${PRODUCT}|x:YouTubeAdsMember`, `${SEGMENT}|x:CloudMember`].sort());
  const periods = extractPeriods(parsed, keys ?? []);
  assert.deepEqual(periods.map((p) => p.end).sort(), ["2025-09-30", "2026-09-30"]);
  assert.equal(periods.find((p) => p.end === "2026-09-30")?.values[`${SEGMENT}|x:CloudMember`], 300);
});

test("no breakdown when the lines do not add up to total revenue", () => {
  const xml = `<xbrl>${context("t", "2026-07-01", "2026-09-30")}${context("a", "2026-07-01", "2026-09-30", [[PRODUCT, "x:AMember"]])}${context("b", "2026-07-01", "2026-09-30", [[PRODUCT, "x:BMember"]])}${fact("t", 1000)}${fact("a", 300)}${fact("b", 300)}</xbrl>`;
  assert.equal(chooseBreakdown(parseInstance(xml), "2026-09-30"), null);
});

test("fourth quarter is the year minus the three filed quarters", () => {
  const q = (end: string) => ({ kind: "Q" as const, end, values: { Cloud: 10, Search: 20 } });
  const out = deriveFourthQuarters([{ kind: "A", end: "2025-12-31", values: { Cloud: 50, Search: 90 } }], [q("2025-03-31"), q("2025-06-30"), q("2025-09-30")]);
  assert.deepEqual(out, [{ kind: "Q", end: "2025-12-31", values: { Cloud: 20, Search: 30 } }]);
  assert.equal(deriveFourthQuarters([{ kind: "A", end: "2025-12-31", values: { Cloud: 50 } }], [q("2025-06-30"), q("2025-09-30")]).length, 0);
});

test("member names come from the filing's labels, cleaned up", () => {
  const lab = `<link:loc xlink:type="locator" xlink:label="loc_1" xlink:href="x.xsd#x_CloudMember"/>
    <link:labelArc xlink:from="loc_1" xlink:to="lab_1" xlink:type="arc"/>
    <link:label xlink:label="lab_1" xlink:role="http://www.xbrl.org/2003/role/label" xml:lang="en-US">Google Cloud® (2) [Member]</link:label>`;
  const names = parseMemberLabels(lab, [`${SEGMENT}|x:CloudMember`, `${PRODUCT}|x:YouTubeAdsMember`]);
  assert.equal(names[`${SEGMENT}|x:CloudMember`], "Google Cloud");
  assert.equal(names[`${PRODUCT}|x:YouTubeAdsMember`], "You Tube Ads");
  assert.equal(fallbackMemberName("us-gaap:ServiceMember"), "Service");
});
