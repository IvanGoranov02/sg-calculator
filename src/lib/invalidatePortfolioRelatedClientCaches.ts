/** Invalidate Portfolio holdings (1h) and Events tab (24h) browser caches together. */
import { browserEventsTtlStorage, invalidateEventsTabTtlCache } from "@/lib/eventsTabTtlCache";
import {
  browserHoldingsTtlStorage,
  invalidatePortfolioHoldingsTtlCache,
} from "@/lib/portfolioHoldingsTtlCache";

export function invalidatePortfolioRelatedClientCaches(): void {
  invalidatePortfolioHoldingsTtlCache(browserHoldingsTtlStorage());
  invalidateEventsTabTtlCache(browserEventsTtlStorage());
}

/** Drop per-user TTL caches on sign-out so a shared browser cannot reuse the prior session. */
export function clearPortfolioRelatedClientCachesOnSignOut(): void {
  invalidatePortfolioRelatedClientCaches();
}
