import type { CompanyRow } from "@/lib/verified/periodStore";

/** Revenue by business line; filled in by the segments step. */
export async function refreshSegmentsIfDue(company: CompanyRow): Promise<void> {
  void company;
}
