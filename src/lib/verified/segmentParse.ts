/**
 * Revenue by business line from the XBRL instance of a 10-K / 10-Q (the segment note).
 * Pure text parsing: no network, no database. A breakdown is only accepted when its parts
 * add up to the company's total revenue for the period, so a wrong reading cannot slip in.
 */

export type SegmentFact = {
  axis: string;
  member: string;
  start: string;
  end: string;
  value: number;
};

export type TotalFact = { start: string; end: string; value: number };

export type ParsedInstance = { facts: SegmentFact[]; totals: TotalFact[] };

/** Revenue tags, most specific first. */
const REVENUE_CONCEPTS = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "Revenues",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "SalesRevenueNet",
];

/** Axes that describe "what the company sells", in order of preference. */
export const SEGMENT_AXES = ["srt:ProductOrServiceAxis", "us-gaap:StatementBusinessSegmentsAxis"];

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);

export function parseInstance(xml: string): ParsedInstance {
  type Ctx = { start: string; end: string; dims: { axis: string; member: string }[]; typed: boolean };
  const contexts = new Map<string, Ctx>();
  const ctxRe = /<(?:xbrli:)?context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:xbrli:)?context>/g;
  for (let m = ctxRe.exec(xml); m; m = ctxRe.exec(xml)) {
    const body = m[2];
    const start = /<(?:xbrli:)?startDate>([^<]+)</.exec(body)?.[1]?.trim();
    const end = /<(?:xbrli:)?endDate>([^<]+)</.exec(body)?.[1]?.trim();
    if (!start || !end) continue; // instants are balance-sheet facts
    const dims: Ctx["dims"] = [];
    const dimRe = /<xbrldi:explicitMember\b[^>]*\bdimension="([^"]+)"[^>]*>([^<]+)</g;
    for (let d = dimRe.exec(body); d; d = dimRe.exec(body)) dims.push({ axis: d[1].trim(), member: d[2].trim() });
    contexts.set(m[1], { start: start.slice(0, 10), end: end.slice(0, 10), dims, typed: body.includes("typedMember") });
  }

  // Per (period, axis, member) keep the value of the most specific revenue tag.
  const best = new Map<string, { priority: number; fact: SegmentFact }>();
  const totals = new Map<string, { priority: number; fact: TotalFact }>();
  // Product lines reported inside a segment (YouTube inside Google Services) carry two
  // dimensions: segment + product. Summed over segments they are the product line.
  const nested = new Map<string, { priority: number; fact: SegmentFact }>();
  const [productAxis, segmentAxis] = SEGMENT_AXES;
  REVENUE_CONCEPTS.forEach((concept, priority) => {
    const factRe = new RegExp(`<us-gaap:${concept}\\b([^>]*)>([^<]+)</us-gaap:${concept}>`, "g");
    for (let f = factRe.exec(xml); f; f = factRe.exec(xml)) {
      const ref = /\bcontextRef="([^"]+)"/.exec(f[1])?.[1];
      const ctx = ref ? contexts.get(ref) : undefined;
      const value = Number(f[2].trim());
      if (!ctx || ctx.typed || !Number.isFinite(value)) continue;
      if (ctx.dims.length === 0) {
        const key = `${ctx.start}|${ctx.end}`;
        const prev = totals.get(key);
        if (!prev || priority < prev.priority) totals.set(key, { priority, fact: { start: ctx.start, end: ctx.end, value } });
      } else if (ctx.dims.length === 1) {
        const { axis, member } = ctx.dims[0];
        const key = `${ctx.start}|${ctx.end}|${axis}|${member}`;
        const prev = best.get(key);
        if (!prev || priority < prev.priority) best.set(key, { priority, fact: { axis, member, start: ctx.start, end: ctx.end, value } });
      } else if (ctx.dims.length === 2) {
        const product = ctx.dims.find((d) => d.axis === productAxis);
        const segment = ctx.dims.find((d) => d.axis === segmentAxis);
        if (!product || !segment) continue;
        const key = `${ctx.start}|${ctx.end}|${productAxis}|${product.member}`;
        const prev = nested.get(key);
        if (!prev || priority < prev.priority) {
          nested.set(key, { priority, fact: { axis: productAxis, member: product.member, start: ctx.start, end: ctx.end, value } });
        } else if (priority === prev.priority) {
          prev.fact.value += value;
        }
      }
    }
  });
  for (const [key, n] of nested) if (!best.has(key)) best.set(key, n);
  return { facts: [...best.values()].map((b) => b.fact), totals: [...totals.values()].map((t) => t.fact) };
}

/** A business line is identified by its axis and member: "srt:ProductOrServiceAxis|goog:YouTubeAdvertisingRevenueMember". */
export const memberKey = (axis: string, member: string) => `${axis}|${member}`;

export type PeriodKindSeg = "A" | "Q";

export function periodKind(start: string, end: string): PeriodKindSeg | null {
  const d = daysBetween(start, end);
  if (d >= 330 && d <= 390) return "A";
  if (d >= 75 && d <= 125) return "Q";
  return null;
}

/** Parts must add up to the total; the small allowance covers lines kept outside the segments (hedging gains). */
const EXACT_TOLERANCE = 0.006;

function valuesFor(parsed: ParsedInstance, start: string, end: string): Map<string, number> {
  const values = new Map<string, number>();
  for (const f of parsed.facts) {
    if (f.start === start && f.end === end && SEGMENT_AXES.includes(f.axis)) values.set(memberKey(f.axis, f.member), f.value);
  }
  return values;
}

/**
 * Choose the breakdown from one filing: the largest set of business lines whose values add
 * up to total revenue. Filings tag sub-totals next to their parts ("Google advertising"
 * beside Search, YouTube and Network; "Products" beside iPhone, Mac, iPad) and split lines
 * over two axes; the largest exact set is the finest breakdown without double counting.
 * To rule out a chance match the same set must also add up in every other period of the
 * filing that reports all of its lines (the prior-year comparative).
 */
export function chooseBreakdown(parsed: ParsedInstance, mainEnd: string): string[] | null {
  const periods = parsed.totals.filter((t) => periodKind(t.start, t.end) && t.value > 0);
  // The filing's own period: the shortest duration ending on the report date.
  const main = periods.filter((t) => t.end === mainEnd).sort((x, y) => daysBetween(x.start, x.end) - daysBetween(y.start, y.end))[0];
  if (!main) return null;
  const mainValues = valuesFor(parsed, main.start, main.end);
  const entries = [...mainValues.entries()].filter(([, v]) => v !== 0).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 16);
  const n = entries.length;
  if (n < 2) return null;
  const others = periods.filter((t) => t !== main).map((t) => ({ total: t.value, values: valuesFor(parsed, t.start, t.end) }));
  const productAxis = SEGMENT_AXES[0];

  let best: { keys: string[]; product: number; diff: number } | null = null;
  for (let mask = 1; mask < 1 << n; mask++) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += entries[i][1];
        count++;
      }
    }
    if (count < 2 || (best && count < best.keys.length)) continue;
    const diff = Math.abs(sum - main.value) / main.value;
    if (diff > EXACT_TOLERANCE) continue;
    const keys = entries.filter((_, i) => mask & (1 << i)).map(([k]) => k);
    let confirmed = true;
    for (const o of others) {
      if (!keys.every((k) => o.values.has(k))) continue;
      const total = keys.reduce((acc, k) => acc + (o.values.get(k) ?? 0), 0);
      if (Math.abs(total - o.total) / o.total > EXACT_TOLERANCE) {
        confirmed = false;
        break;
      }
    }
    if (!confirmed) continue;
    const product = keys.filter((k) => k.startsWith(`${productAxis}|`)).length;
    if (!best || count > best.keys.length || product > best.product || (product === best.product && diff < best.diff)) {
      best = { keys, product, diff };
    }
  }
  return best?.keys ?? null;
}

export type SegmentValues = { kind: PeriodKindSeg; end: string; values: Record<string, number> };

/** Every period in the filing for which the chosen lines are all reported and add up to the total. */
export function extractPeriods(parsed: ParsedInstance, keys: string[]): SegmentValues[] {
  const out: SegmentValues[] = [];
  for (const total of parsed.totals) {
    const kind = periodKind(total.start, total.end);
    if (!kind || !(total.value > 0)) continue;
    const all = valuesFor(parsed, total.start, total.end);
    const values: Record<string, number> = {};
    let sum = 0;
    let present = 0;
    for (const k of keys) {
      const v = all.get(k);
      if (v == null) continue;
      values[k] = v;
      sum += v;
      present++;
    }
    if (present < 2) continue;
    if (Math.abs(sum - total.value) / total.value > 0.01) continue;
    out.push({ kind, end: total.end, values });
  }
  return out;
}

/** Human names of the members from the filing's label linkbase ("goog:GoogleCloudMember" → "Google Cloud"). */
export function parseMemberLabels(labXml: string, members: string[]): Record<string, string> {
  const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
  const locToElement = new Map<string, string>();
  for (const m of labXml.matchAll(/<link:loc\b[^>]*>/g)) {
    const href = attr(m[0], "xlink:href");
    const label = attr(m[0], "xlink:label");
    const id = href?.split("#")[1];
    if (id && label) locToElement.set(label, id);
  }
  const labelToElement = new Map<string, string>();
  for (const m of labXml.matchAll(/<link:labelArc\b[^>]*>/g)) {
    const from = attr(m[0], "xlink:from");
    const to = attr(m[0], "xlink:to");
    const el = from ? locToElement.get(from) : undefined;
    if (el && to) labelToElement.set(to, el);
  }
  // Keys are "axis|prefix:Member"; the linkbase identifies elements as "prefix_Member".
  const wanted = new Map(members.map((m) => [(m.split("|")[1] ?? m).replace(":", "_"), m]));
  const found: Record<string, { text: string; rank: number }> = {};
  for (const m of labXml.matchAll(/<link:label\b([^>]*)>([^<]*)<\/link:label>/g)) {
    const el = labelToElement.get(attr(m[1], "xlink:label") ?? "");
    const member = el ? wanted.get(el) : undefined;
    if (!member) continue;
    const role = attr(m[1], "xlink:role") ?? "";
    const rank = role.endsWith("/terseLabel") ? 0 : role.endsWith("/label") ? 1 : 2;
    // Same line, same name across filings: drop "[Member]", trademark signs and footnote marks.
    const text = decodeXml(m[2])
      .replace(/\s*\[Member\]\s*$/i, "")
      .replace(/[®™]/g, "")
      .replace(/\s*\(\d+\)\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text && (!found[member] || rank < found[member].rank)) found[member] = { text, rank };
  }
  const out: Record<string, string> = {};
  for (const member of members) out[member] = found[member]?.text ?? fallbackMemberName(member);
  return out;
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

export function fallbackMemberName(member: string): string {
  const local = (member.split(":").pop() ?? member).replace(/Member$/, "");
  return local.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").trim();
}

/**
 * Fourth quarters are never reported on their own: derive them as year minus the three
 * filed quarters (only when all three are present for every member).
 */
export function deriveFourthQuarters(annual: SegmentValues[], quarterly: SegmentValues[]): SegmentValues[] {
  const out: SegmentValues[] = [];
  for (const fy of annual) {
    if (quarterly.some((q) => q.end === fy.end)) continue;
    const qs = quarterly.filter((q) => {
      const d = daysBetween(q.end, fy.end);
      return d > 60 && d < 300;
    });
    if (qs.length !== 3) continue;
    const values: Record<string, number> = {};
    let ok = true;
    for (const [member, total] of Object.entries(fy.values)) {
      let rest = total;
      for (const q of qs) {
        if (q.values[member] == null) ok = false;
        else rest -= q.values[member];
      }
      values[member] = rest;
    }
    if (ok) out.push({ kind: "Q", end: fy.end, values });
  }
  return out;
}
