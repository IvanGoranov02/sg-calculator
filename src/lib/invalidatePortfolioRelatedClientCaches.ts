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
