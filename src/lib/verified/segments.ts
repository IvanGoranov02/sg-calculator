import { edgarArchiveUrl, edgarFetchText, fetchRecentReports, lookupCik, type EdgarFiling } from "@/lib/edgar/client";
import type { CompanySegments, SegmentPeriod } from "@/lib/stockAnalysisTypes";
import { saveCompanySegments, type CompanyRow } from "@/lib/verified/periodStore";
import {
  chooseBreakdown,
  deriveFourthQuarters,
  extractPeriods,
  parseInstance,
  parseMemberLabels,
  type SegmentValues,
} from "@/lib/verified/segmentParse";
import { UNIVERSE } from "@/lib/verified/universe";

/**
 * Revenue by business line (Google Cloud, YouTube, AWS, iPhone…) for the largest companies,
 * read from the segment note of their 10-K / 10-Q filings. Collected a few filings at a time
 * (each is several MB) and stored with the company; later only new filings are read.
 */

/** Largest companies first; widen by raising the rank. */
const SEGMENT_MAX_RANK = 60;
const HISTORY_YEARS = 5.3;
const DAY_MS = 86_400_000;
const RECHECK_MS = 7 * DAY_MS;
const EMPTY_RETRY_MS = 30 * DAY_MS;

export type StoredSegments = CompanySegments & {
  /** XBRL line ("axis|member") → display name. Lines are matched across filings by name. */
  members: Record<string, string>;
  /** Accession numbers already read. */
  done: string[];
  complete: boolean;
};

const ELIGIBLE = new Set(UNIVERSE.filter((u) => (u.w ?? 1e9) <= SEGMENT_MAX_RANK || (u.u ?? 1e9) <= SEGMENT_MAX_RANK).map((u) => u.s));

export function segmentsEligible(symbol: string): boolean {
  return ELIGIBLE.has(symbol) && !symbol.includes(".");
}

/** Symbols whose business lines are collected. */
export const SEGMENT_SYMBOLS: string[] = [...ELIGIBLE].filter((s) => !s.includes("."));

/** True when there is something to read for this company right now. */
export function segmentsDue(company: CompanyRow): boolean {
  return company.profile !== "bank" && company.periods > 0 && segmentsEligible(company.symbol) && isDue(company);
}

const toValues = (kind: "A" | "Q", rows: SegmentPeriod[]): SegmentValues[] => rows.map((r) => ({ kind, end: r.date, values: r.values }));
const toPeriods = (rows: SegmentValues[]): SegmentPeriod[] =>
  rows.map((r) => ({ date: r.end, values: r.values })).sort((a, b) => a.date.localeCompare(b.date));

/**
 * Read filings not read yet (newest first) for at most `budgetMs` and return the updated
 * state; call again while `complete` is false. Returns null when the company has no
 * breakdown that adds up to its total revenue. No database access.
 */
export async function collectSegments(symbolRaw: string, prev: StoredSegments | null, budgetMs: number): Promise<StoredSegments | null> {
  const symbol = symbolRaw.trim().toUpperCase();
  const started = Date.now();
  const entry = await lookupCik(symbol);
  if (!entry) return null;
  const since = new Date(Date.now() - HISTORY_YEARS * 365 * DAY_MS).toISOString().slice(0, 10);
  const filings = (await fetchRecentReports(entry.cik)).filter((f) => f.reportDate >= since);
  if (filings.length === 0) return prev;

  let members: Record<string, string> = { ...(prev?.members ?? {}) };
  const done = new Set(prev?.done ?? []);
  // Values are keyed by display name: the same line is tagged differently in a 10-K and a 10-Q.
  const annual = new Map<string, SegmentValues>(toValues("A", prev?.annual ?? []).map((r) => [r.end, r]));
  const quarterly = new Map<string, SegmentValues>(toValues("Q", prev?.quarterly ?? []).map((r) => [r.end, r]));

  const file = (f: EdgarFiling, suffix: string) =>
    edgarFetchText(edgarArchiveUrl(entry.cik, f.accession, f.primaryDocument.replace(/\.htm$/i, suffix)), 30_000);
  const hasNear = (map: Map<string, SegmentValues>, date: string) => {
    const t = Date.parse(date);
    for (const k of map.keys()) if (Math.abs(Date.parse(k) - t) <= 20 * DAY_MS) return true;
    return false;
  };
  const yearsBefore = (date: string, years: number) => new Date(Date.parse(date) - years * 365 * DAY_MS).toISOString().slice(0, 10);
  /**
   * A filing adds nothing when newer ones already gave everything it holds: its own period
   * and its oldest comparative (two years back in a 10-K, one year back in a 10-Q).
   */
  const alreadyCovered = (f: EdgarFiling) =>
    f.form === "10-K"
      ? hasNear(annual, f.reportDate) && hasNear(annual, yearsBefore(f.reportDate, 2))
      : hasNear(quarterly, f.reportDate) && hasNear(quarterly, yearsBefore(f.reportDate, 1));

  let sawBreakdown = Object.keys(members).length > 0;
  for (const f of filings) {
    if (done.has(f.accession)) continue;
    if (Date.now() - started > budgetMs) break;
    if (sawBreakdown && alreadyCovered(f)) {
      done.add(f.accession);
      continue;
    }
    const xml = await file(f, "_htm.xml");
    done.add(f.accession);
    if (!xml) continue;
    const parsed = parseInstance(xml);
    let periods = extractPeriods(parsed, Object.keys(members));
    if (periods.length === 0) {
      // First filing, a differently tagged form, or the company reorganised its business
      // lines: read this filing with the breakdown it uses itself.
      const keys = chooseBreakdown(parsed, f.reportDate);
      if (!keys) {
        if (!sawBreakdown) return null;
        continue;
      }
      const fresh = keys.filter((k) => !(k in members));
      if (fresh.length > 0) {
        // Labels sit in a separate linkbase, or inside the schema for filers that embed it.
        const labels = (await file(f, "_lab.xml")) ?? (await file(f, ".xsd")) ?? "";
        members = { ...members, ...parseMemberLabels(labels, fresh) };
      }
      periods = extractPeriods(parsed, keys);
      sawBreakdown = true;
    }
    for (const p of periods) {
      // Newest filing first: keep the first value seen for a period (the latest restated one).
      const map = p.kind === "A" ? annual : quarterly;
      if (hasNear(map, p.end)) continue;
      const named: Record<string, number> = {};
      for (const [key, v] of Object.entries(p.values)) {
        const name = members[key] ?? key;
        named[name] = (named[name] ?? 0) + v;
      }
      map.set(p.end, { kind: p.kind, end: p.end, values: named });
    }
  }

  const annualRows = [...annual.values()];
  const quarterRows = [...quarterly.values()];
  for (const q4 of deriveFourthQuarters(annualRows, quarterRows)) quarterRows.push(q4);

  const annualOut = toPeriods(annualRows).slice(-5);
  const quarterOut = toPeriods(quarterRows).slice(-20);
  const latest = quarterOut[quarterOut.length - 1] ?? annualOut[annualOut.length - 1];
  const used = new Set([...annualOut, ...quarterOut].flatMap((p) => Object.keys(p.values)));
  const names = [...used].sort((a, b) => (latest?.values[b] ?? -1) - (latest?.values[a] ?? -1));
  return {
    names,
    annual: annualOut,
    quarterly: quarterOut,
    members,
    done: [...done],
    complete: filings.every((f) => done.has(f.accession)),
  };
}

function isDue(company: CompanyRow, now = Date.now()): boolean {
  const stored = company.segments as StoredSegments | null;
  const checked = company.segmentsCheckedAt ? Date.parse(company.segmentsCheckedAt) : 0;
  if (!stored) return now - checked >= EMPTY_RETRY_MS;
  if (!stored.complete) return true;
  // Complete: look again only when the statements have a newer quarter than the breakdown.
  const last = stored.quarterly[stored.quarterly.length - 1]?.date ?? "";
  return company.latestQuarter != null && company.latestQuarter > last && now - checked >= RECHECK_MS;
}

/** Collect or extend the stored breakdown when there is something new to read. */
export async function refreshSegmentsIfDue(company: CompanyRow, budgetMs = 20_000): Promise<void> {
  if (!segmentsDue(company)) return;
  // After a complete pass only filings newer than the stored ones are unread, so this is cheap.
  const next = await collectSegments(company.symbol, company.segments as StoredSegments | null, budgetMs);
  await saveCompanySegments(company.symbol, next && next.names.length > 0 ? next : null);
}
