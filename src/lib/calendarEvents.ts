/** Grace window (days) for showing recently past events. */
export const PAST_EVENT_GRACE_DAYS = 2;

export type EventKind = "earnings" | "exDividend" | "dividendPay";

export type SymbolEventRow = {
  symbol: string;
  name: string;
  /** Next (or most recent) earnings date, ISO yyyy-mm-dd. */
  earningsDate: string | null;
  /** Ex-dividend date, ISO yyyy-mm-dd. */
  exDividendDate: string | null;
  /** Dividend pay date, ISO yyyy-mm-dd. */
  dividendPayDate: string | null;
};

export type FlatEvent = {
  symbol: string;
  name: string;
  kind: EventKind;
  date: string;
  days: number;
};

type YahooCalendarEvents = {
  earnings?: { earningsDate?: Array<Date | string> };
  exDividendDate?: Date | string;
  dividendDate?: Date | string;
};

function parseDate(value: Date | string): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Typical quarterly earnings cadence used when Yahoo only has past dates. */
export const EARNINGS_CYCLE_DAYS = 91;

export type ResolvedEarningsDate = {
  /** ISO yyyy-mm-dd, always >= today when non-null. */
  date: string | null;
  /** True when projected from a past report (+ ~91 days), not from Yahoo. */
  estimated: boolean;
};

/** Local calendar yyyy-mm-dd for `nowMs` (matches Events tab today-boundary). */
function todayIsoLocal(nowMs: number): string {
  return toIsoLocal(new Date(nowMs));
}

function addUtcDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Normalize Yahoo/Date/ISO inputs to yyyy-mm-dd without UTC day-shift on bare ISO dates. */
function toEarningsIso(value: Date | string): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const bare = trimmed.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(bare)) return bare;
  }
  const d = parseDate(value);
  return d ? toIsoDate(d) : null;
}

/**
 * First earnings date on/after today (local calendar day). If the source only has
 * past dates, project forward in ~91-day steps from the latest past date (estimated).
 */
export function resolveNextEarningsOrEstimate(
  rawDates: Array<Date | string | null | undefined>,
  nowMs: number = Date.now(),
): ResolvedEarningsDate {
  const parsed = rawDates
    .map((value) => {
      if (value == null || value === "") return null;
      return toEarningsIso(value);
    })
    .filter((iso): iso is string => iso != null)
    .sort();
  if (parsed.length === 0) return { date: null, estimated: false };

  const today = todayIsoLocal(nowMs);
  const upcoming = parsed.filter((iso) => iso >= today);
  if (upcoming.length > 0) return { date: upcoming[0]!, estimated: false };

  let projected = parsed[parsed.length - 1]!;
  // Advance by quarterly cadence until we land on/after today.
  while (projected < today) {
    projected = addUtcDaysIso(projected, EARNINGS_CYCLE_DAYS);
  }
  return { date: projected, estimated: true };
}

/**
 * Next upcoming (or most recent) earnings date from a quoteSummary calendarEvents
 * block. Used by the Events calendar — may return a recent past date within a
 * 1-day grace window. Stock analysis uses {@link resolveNextEarningsOrEstimate}.
 */
export function nextEarningsDate(qs: unknown): string | null {
  const ce = (qs as { calendarEvents?: YahooCalendarEvents })?.calendarEvents;
  const raw = ce?.earnings?.earningsDate;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const parsed = raw.map(parseDate).filter((d): d is Date => d !== null);
  if (parsed.length === 0) return null;
  const t0 = Date.now() - 86_400_000;
  const upcoming = parsed.filter((d) => d.getTime() >= t0).sort((a, b) => a.getTime() - b.getTime());
  return toIsoDate(upcoming[0] ?? parsed[parsed.length - 1]);
}

function singleCalendarDate(qs: unknown, field: "exDividendDate" | "dividendDate"): string | null {
  const ce = (qs as { calendarEvents?: YahooCalendarEvents })?.calendarEvents;
  const raw = ce?.[field];
  if (raw == null) return null;
  const parsed = parseDate(raw);
  return parsed ? toIsoDate(parsed) : null;
}

export function extractExDividendDate(qs: unknown): string | null {
  return singleCalendarDate(qs, "exDividendDate");
}

export function extractDividendPayDate(qs: unknown): string | null {
  return singleCalendarDate(qs, "dividendDate");
}

export function extractSymbolEventRow(
  qs: unknown,
  symbol: string,
  name: string,
): SymbolEventRow {
  return {
    symbol,
    name,
    earningsDate: nextEarningsDate(qs),
    exDividendDate: extractExDividendDate(qs),
    dividendPayDate: extractDividendPayDate(qs),
  };
}

export function daysUntil(iso: string, now = Date.now()): number | null {
  const target = parseIsoLocal(iso);
  if (Number.isNaN(target.getTime())) return null;
  const today = startOfLocalDay(new Date(now));
  const targetDay = startOfLocalDay(target);
  const days = Math.round((targetDay.getTime() - today.getTime()) / 86_400_000);
  return days === 0 ? 0 : days;
}

export type EventRelativeLabels = {
  today: string;
  yesterday: string;
  daysAgo: string;
  tomorrow: string;
  inDays: string;
};

/** Format relative day offset for event cards; `daysAgo` / `inDays` use `{days}` placeholder. */
export function formatEventRelativeDays(days: number, labels: EventRelativeLabels): string {
  if (days === 0) return labels.today;
  if (days === -1) return labels.yesterday;
  if (days < -1) return labels.daysAgo.replace("{days}", String(-days));
  if (days === 1) return labels.tomorrow;
  return labels.inDays.replace("{days}", String(days));
}

const KIND_ORDER: Record<EventKind, number> = {
  earnings: 0,
  exDividend: 1,
  dividendPay: 2,
};

/** Merge watchlist + portfolio Yahoo symbols, deduplicated and uppercased. */
export function unionEventSymbols(watchlist: string[], portfolioYahoo: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...watchlist, ...portfolioYahoo]) {
    const s = raw.trim().toUpperCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Flatten per-symbol dates into a chronological upcoming list; undated = no known events. */
export function flattenUpcomingEvents(
  rows: SymbolEventRow[],
  graceDays = PAST_EVENT_GRACE_DAYS,
  now = Date.now(),
): { upcoming: FlatEvent[]; undated: Pick<SymbolEventRow, "symbol" | "name">[] } {
  const upcoming: FlatEvent[] = [];
  const undated: Pick<SymbolEventRow, "symbol" | "name">[] = [];

  for (const r of rows) {
    let hasKnown = false;
    const pairs: [EventKind, string | null][] = [
      ["earnings", r.earningsDate],
      ["exDividend", r.exDividendDate],
      ["dividendPay", r.dividendPayDate],
    ];
    for (const [kind, date] of pairs) {
      if (!date) continue;
      const days = daysUntil(date, now);
      if (days == null) continue;
      if (days >= -graceDays) {
        upcoming.push({ symbol: r.symbol, name: r.name, kind, date, days });
        hasKnown = true;
      }
    }
    if (!hasKnown) undated.push({ symbol: r.symbol, name: r.name });
  }

  upcoming.sort((a, b) => {
    if (a.days !== b.days) return a.days - b.days;
    const sym = a.symbol.localeCompare(b.symbol);
    if (sym !== 0) return sym;
    return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  });

  return { upcoming, undated };
}

function parseIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday of the calendar week containing `iso` (local). */
export function mondayOfWeek(iso: string): string {
  const d = parseIsoLocal(iso);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return toIsoLocal(d);
}

/** Sunday of the calendar week starting on `weekStartIso` (Monday, local). */
export function sundayOfWeek(weekStartIso: string): string {
  const d = parseIsoLocal(weekStartIso);
  d.setDate(d.getDate() + 6);
  return toIsoLocal(d);
}

export type DayEventGroup = {
  date: string;
  events: FlatEvent[];
};

export type WeekEventGroup = {
  weekStart: string;
  weekEnd: string;
  days: DayEventGroup[];
};

/** Group flat events into calendar weeks (Mon–Sun) and days for list layout. */
export function groupEventsByWeek(events: FlatEvent[]): WeekEventGroup[] {
  const byDate = new Map<string, FlatEvent[]>();
  for (const e of events) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }

  const byWeek = new Map<string, DayEventGroup[]>();
  for (const date of [...byDate.keys()].sort()) {
    const weekStart = mondayOfWeek(date);
    const days = byWeek.get(weekStart) ?? [];
    days.push({ date, events: byDate.get(date)! });
    byWeek.set(weekStart, days);
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, days]) => ({
      weekStart,
      weekEnd: sundayOfWeek(weekStart),
      days,
    }));
}

const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "short" });

/** e.g. "OCT 4 – 10" or "SEP 29 – OCT 5" */
export function formatWeekRangeLabel(weekStart: string, weekEnd: string): string {
  const start = parseIsoLocal(weekStart);
  const end = parseIsoLocal(weekEnd);
  const startMonth = MONTH_FMT.format(start).toUpperCase();
  const endMonth = MONTH_FMT.format(end).toUpperCase();
  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()} – ${end.getDate()}`;
  }
  return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}`;
}

export function formatDayGutter(iso: string, locale: "en" | "bg"): { weekday: string; day: number } {
  const d = parseIsoLocal(iso);
  const weekday = d.toLocaleDateString(locale === "bg" ? "bg-BG" : "en-US", { weekday: "short" }).toUpperCase();
  return { weekday, day: d.getDate() };
}
