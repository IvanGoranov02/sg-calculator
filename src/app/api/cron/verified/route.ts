import { VERIFIED_CANDIDATES } from "@/lib/verified/candidates";
import { buildVerified, newQuarterCheckDue, refreshVerified } from "@/lib/verified/service";
import { listVerified, readVerified } from "@/lib/verified/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUDGET_MS = 45_000;
const FAILED_RETRY_MS = 7 * 86_400_000;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) return request.headers.get("authorization") === `Bearer ${secret}`;
  // No secret configured: accept Vercel's scheduler only. The job is idempotent and
  // throttled by the stored check times, so a spoofed call cannot do more than one pass.
  return (request.headers.get("user-agent") ?? "").includes("vercel-cron");
}

/**
 * Daily: build candidates that have no row yet, append newly filed quarters, and retry
 * old failures. Works through as many companies as fit in the time budget; the rest are
 * picked up by the next run (or built on first view).
 */
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  const done: { symbol: string; result: string }[] = [];
  try {
    const rows = new Map((await listVerified()).map((r) => [r.symbol, r]));
    for (const symbol of VERIFIED_CANDIDATES) {
      if (Date.now() - started > BUDGET_MS) break;
      const row = rows.get(symbol);
      try {
        if (!row) {
          done.push({ symbol, result: (await buildVerified(symbol)).status });
        } else if (row.status === "failed") {
          if (Date.now() - Date.parse(row.checkedAt) >= FAILED_RETRY_MS) {
            done.push({ symbol, result: (await buildVerified(symbol)).status });
          }
        } else if (newQuarterCheckDue(row)) {
          const full = await readVerified(symbol);
          if (full) done.push({ symbol, result: (await refreshVerified(full)).status });
        }
      } catch (e) {
        done.push({ symbol, result: `error: ${e instanceof Error ? e.message : "unknown"}` });
      }
    }
    return Response.json({ ok: true, processed: done.length, done, ms: Date.now() - started });
  } catch {
    return Response.json({ error: "Database unavailable." }, { status: 503 });
  }
}
