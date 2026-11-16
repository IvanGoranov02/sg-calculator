import { runQueue } from "@/lib/verified/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUDGET_MS = 45_000;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) return request.headers.get("authorization") === `Bearer ${secret}`;
  // No secret configured: accept the Vercel scheduler only. The job is idempotent and each
  // company is only touched when it is due, so a spoofed call cannot do more than one pass.
  return (request.headers.get("user-agent") ?? "").includes("vercel-cron");
}

/**
 * Works through the fundamentals queue for one time budget: companies of the universe that
 * are not stored yet (largest first), then companies whose next report should be out.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const run = await runQueue(BUDGET_MS);
    return Response.json({ ok: true, processed: run.processed.length, remaining: run.remaining, done: run.processed, ms: run.ms });
  } catch {
    return Response.json({ error: "Database unavailable." }, { status: 503 });
  }
}
