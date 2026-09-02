/**
 * Supabase transaction pooler (port 6543 / pgbouncer) + Prisma:
 * prepared statements and a large Prisma connection pool cause
 * "Server has closed the connection" / "bytes remaining on stream"
 * and queries that wait indefinitely for a slot.
 */

const TRANSIENT_PRISMA_CODES = new Set([
  "P1001",
  "P1002",
  "P1008",
  "P1017",
  "P2024",
]);

const TRANSIENT_MESSAGE_SNIPPETS = [
  "server has closed the connection",
  "bytes remaining on stream",
  "timed out fetching a new connection",
  "connection reset",
  "can't reach database server",
  "connection terminated",
  "connectorerror",
  "closed the connection",
];

export type PooledDatabaseUrlOptions = {
  /** Prisma client pool size when talking to pgbouncer (default 1). */
  connectionLimit?: number;
};

function isPgbouncerUrl(parsed: URL): boolean {
  if (parsed.searchParams.get("pgbouncer") === "true") return true;
  return parsed.port === "6543";
}

/**
 * Ensure pgbouncer query params on a pooled Postgres URL.
 * Returns the original string if it is not a parseable URL.
 * Never logs the URL — it contains credentials.
 *
 * connection_limit=1 keeps Prisma from opening a large pool against pgbouncer
 * transaction mode. pool_timeout bounds how long we wait for a slot if a prior
 * query is stuck. Callers should not retry after a Promise-race timeout (that
 * would stack queries on the single connection).
 */
export function configurePooledDatabaseUrl(
  url: string,
  opts?: PooledDatabaseUrlOptions,
): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!isPgbouncerUrl(parsed)) return url;

  if (parsed.searchParams.get("pgbouncer") !== "true") {
    parsed.searchParams.set("pgbouncer", "true");
  }
  if (!parsed.searchParams.has("connection_limit")) {
    const limit = opts?.connectionLimit ?? 1;
    parsed.searchParams.set("connection_limit", String(limit));
  }
  if (!parsed.searchParams.has("pool_timeout")) {
    parsed.searchParams.set("pool_timeout", "8");
  }
  return parsed.toString();
}

export function isTransientPrismaError(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code: unknown }).code);
    if (TRANSIENT_PRISMA_CODES.has(code)) return true;
  }
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return TRANSIENT_MESSAGE_SNIPPETS.some((s) => msg.includes(s));
}
