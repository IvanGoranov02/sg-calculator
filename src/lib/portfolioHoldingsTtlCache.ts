/**
 * Portfolio holdings tab cache (1 hour rolling TTL, per user).
 *
 * A successful /api/portfolio payload is reused until TTL expires. Opening
 * Holdings again within the hour does not refetch or show a spinner.
 * Refresh data, sync, disconnect, holding edits, and base-currency change
 * invalidate immediately.
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
import type { PortfolioQuoteRow } from "@/lib/portfolioMarketData";
import type { PortfolioFxRates } from "@/lib/portfolioFx";

export const PORTFOLIO_HOLDINGS_TTL_MS = 60 * 60 * 1000;
export const PORTFOLIO_HOLDINGS_TTL_CACHE_KEY = "sg-portfolio-holdings-ttl-v1";

export type PortfolioHoldingsCachePayload = {
  holdings: Array<{
    id: string;
    symbolYahoo: string;
    symbolT212: string | null;
    quantity: string;
    avgPrice: string;
    currency: string;
    source: "manual" | "t212";
    updatedAt: string;
  }>;
  quotes: Record<string, PortfolioQuoteRow | null>;
  fx: PortfolioFxRates;
  trading212: {
    encryptionConfigured: boolean;
    connected: boolean;
    environment: "demo" | "live" | null;
    lastSyncAt: string | null;
    lastError: string | null;
  } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function isUsablePortfolioHoldingsPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.holdings)) return false;
  if (!isRecord(value.quotes)) return false;
  if (!isRecord(value.fx)) return false;
  // trading212 may be null after 401-cleared sessions in the UI, but a successful
  // API payload always includes the object. Allow null for defensive reads.
  if (value.trading212 != null && !isRecord(value.trading212)) return false;
  return true;
}

/** Last successful load in this browser tab. */
let sessionMemory: ClientTtlMemory<PortfolioHoldingsCachePayload> | null = null;
let loadGeneration = 0;

export function beginPortfolioHoldingsLoad(): number {
  loadGeneration += 1;
  return loadGeneration;
}

export function isPortfolioHoldingsLoadCurrent(generation: number): boolean {
  return generation === loadGeneration;
}

export function browserHoldingsTtlStorage(): Storage | null {
  return browserLocalStorage();
}

export function invalidatePortfolioHoldingsTtlCache(storage: KeyValueStorage | null): void {
  loadGeneration += 1;
  sessionMemory = null;
  removeStoredClientTtlCache(storage, PORTFOLIO_HOLDINGS_TTL_CACHE_KEY);
}

export function readPortfolioHoldingsSessionMemory(): ClientTtlMemory<PortfolioHoldingsCachePayload> | null {
  if (typeof window === "undefined") return null;
  return sessionMemory;
}

export function writePortfolioHoldingsSessionMemory(
  memory: ClientTtlMemory<PortfolioHoldingsCachePayload> | null,
): void {
  if (typeof window === "undefined") return;
  sessionMemory = memory;
}

export function readStoredPortfolioHoldingsTtlCache(
  storage: KeyValueStorage | null,
  userId: string,
): ClientTtlCacheRecord<PortfolioHoldingsCachePayload> | null {
  return readStoredClientTtlCache(
    storage,
    PORTFOLIO_HOLDINGS_TTL_CACHE_KEY,
    userId,
    isUsablePortfolioHoldingsPayload,
  );
}

export function decidePortfolioHoldingsLoad(input: {
  userId: string;
  reloadToken: number;
  liveRefreshToken: number;
  nowMs?: number;
  memory: ClientTtlMemory<PortfolioHoldingsCachePayload> | null;
  stored: ClientTtlCacheRecord<PortfolioHoldingsCachePayload> | null;
}): TtlLoadDecision<PortfolioHoldingsCachePayload> {
  return decideClientTtlLoad({
    userId: input.userId,
    ttlMs: PORTFOLIO_HOLDINGS_TTL_MS,
    reloadToken: input.reloadToken,
    liveRefreshToken: input.liveRefreshToken,
    nowMs: input.nowMs,
    memory: input.memory,
    stored: input.stored,
  });
}

export function commitPortfolioHoldingsTtlCache(input: {
  storage: KeyValueStorage | null;
  userId: string;
  payload: PortfolioHoldingsCachePayload;
  reloadToken: number;
  liveRefreshToken: number;
  nowMs?: number;
}): void {
  if (!input.userId) return;
  const record: ClientTtlCacheRecord<PortfolioHoldingsCachePayload> = {
    userId: input.userId,
    fetchedAt: input.nowMs ?? Date.now(),
    payload: input.payload,
  };
  writePortfolioHoldingsSessionMemory({
    ...record,
    reloadToken: input.reloadToken,
    liveRefreshToken: input.liveRefreshToken,
  });
  writeStoredClientTtlCache(input.storage, PORTFOLIO_HOLDINGS_TTL_CACHE_KEY, record);
}
