/**
 * Events tab cache (24 hour rolling TTL, per user).
 *
 * First open loads portfolio symbols + calendar rows; later opens within 24h
 * reuse localStorage / session memory with no spinner. Portfolio changes
 * (sync, holdings edits, currency) and Refresh-driven invalidation clear it.
 */

import {
  browserLocalStorage,
  decideClientTtlLoad,
  readStoredClientTtlCache,
  removeStoredClientTtlCache,
  writeStoredClientTtlCache,
  type ClientTtlCacheRecord,
  type ClientTtlMemory,
  type KeyValueStorage,
  type TtlLoadDecision,
} from "@/lib/clientTtlCache";
import type { SymbolEventRow } from "@/lib/calendarEvents";
import type { PortfolioDividendPayment } from "@/lib/portfolioDividends";
import type { PortfolioFxRates } from "@/lib/portfolioFx";
import type { PortfolioQuoteRow } from "@/lib/portfolioMarketData";

export const EVENTS_TAB_TTL_MS = 24 * 60 * 60 * 1000;
export const EVENTS_TAB_TTL_CACHE_KEY = "sg-events-tab-ttl-v1";

export type EventsTabCachePayload = {
  portfolioSymbols: string[];
  portfolioHoldings: Array<{
    symbolYahoo: string;
    quantity: string;
    currency: string;
  }>;
  portfolioQuotes: Record<string, PortfolioQuoteRow | null>;
  portfolioFx: PortfolioFxRates;
  dividendPayments: PortfolioDividendPayment[];
  /** Sorted unique symbols used for /api/events (watchlist ∪ portfolio). */
  symbolsKey: string;
  rows: SymbolEventRow[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function eventsSymbolsKey(symbols: string[]): string {
  return [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))].sort().join(",");
}

export function isUsableEventsTabPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.portfolioSymbols) &&
    Array.isArray(value.portfolioHoldings) &&
    isRecord(value.portfolioQuotes) &&
    isRecord(value.portfolioFx) &&
    Array.isArray(value.dividendPayments) &&
    typeof value.symbolsKey === "string" &&
    Array.isArray(value.rows)
  );
}

let sessionMemory: ClientTtlMemory<EventsTabCachePayload> | null = null;
let loadGeneration = 0;

export function beginEventsTabLoad(): number {
  loadGeneration += 1;
  return loadGeneration;
}

export function isEventsTabLoadCurrent(generation: number): boolean {
  return generation === loadGeneration;
}

export function browserEventsTtlStorage(): Storage | null {
  return browserLocalStorage();
}

export function invalidateEventsTabTtlCache(storage: KeyValueStorage | null): void {
  loadGeneration += 1;
  sessionMemory = null;
  removeStoredClientTtlCache(storage, EVENTS_TAB_TTL_CACHE_KEY);
}

export function readEventsTabSessionMemory(): ClientTtlMemory<EventsTabCachePayload> | null {
  if (typeof window === "undefined") return null;
  return sessionMemory;
}

export function writeEventsTabSessionMemory(memory: ClientTtlMemory<EventsTabCachePayload> | null): void {
  if (typeof window === "undefined") return;
  sessionMemory = memory;
}

export function readStoredEventsTabTtlCache(
  storage: KeyValueStorage | null,
  userId: string,
): ClientTtlCacheRecord<EventsTabCachePayload> | null {
  return readStoredClientTtlCache(storage, EVENTS_TAB_TTL_CACHE_KEY, userId, isUsableEventsTabPayload);
}

export function decideEventsTabLoad(input: {
  userId: string;
  symbolsKey: string;
  reloadToken?: number;
  liveRefreshToken?: number;
  nowMs?: number;
  memory: ClientTtlMemory<EventsTabCachePayload> | null;
  stored: ClientTtlCacheRecord<EventsTabCachePayload> | null;
}): TtlLoadDecision<EventsTabCachePayload> {
  return decideClientTtlLoad({
    userId: input.userId,
    ttlMs: EVENTS_TAB_TTL_MS,
    reloadToken: input.reloadToken ?? 0,
    liveRefreshToken: input.liveRefreshToken ?? 0,
    nowMs: input.nowMs,
    scopeKey: input.symbolsKey,
    memory: input.memory,
    stored: input.stored,
  });
}

export function commitEventsTabTtlCache(input: {
  storage: KeyValueStorage | null;
  userId: string;
  payload: EventsTabCachePayload;
  reloadToken?: number;
  liveRefreshToken?: number;
  nowMs?: number;
}): void {
  if (!input.userId) return;
  const record: ClientTtlCacheRecord<EventsTabCachePayload> = {
    userId: input.userId,
    fetchedAt: input.nowMs ?? Date.now(),
    scopeKey: input.payload.symbolsKey,
    payload: input.payload,
  };
  writeEventsTabSessionMemory({
    ...record,
    reloadToken: input.reloadToken ?? 0,
    liveRefreshToken: input.liveRefreshToken ?? 0,
  });
  writeStoredClientTtlCache(input.storage, EVENTS_TAB_TTL_CACHE_KEY, record);
}
