import { Prisma } from "@prisma/client";

/**
 * Structured logs for Vercel Runtime Logs / `vercel logs`.
 * Never pass API keys, secrets, or Authorization headers.
 */
export function logApiException(
  scope: string,
  e: unknown,
  extra?: Record<string, string | number | boolean | null | undefined>,
): void {
  const line: Record<string, unknown> = {
    scope,
    ts: new Date().toISOString(),
    ...extra,
  };

  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    line.kind = "PrismaClientKnownRequestError";
    line.prismaCode = e.code;
    line.message = e.message;
    line.meta = e.meta;
  } else if (e instanceof Prisma.PrismaClientInitializationError) {
    line.kind = "PrismaClientInitializationError";
    line.message = e.message;
  } else if (e instanceof Prisma.PrismaClientRustPanicError) {
    line.kind = "PrismaClientRustPanicError";
    line.message = e.message;
  } else if (e instanceof Error) {
    line.kind = "Error";
    line.name = e.name;
    line.message = e.message;
    line.stack = e.stack;
  } else {
    line.kind = "unknown";
    line.value = String(e);
  }

  console.error("[sg-api]", JSON.stringify(line));
}

export function logApiInfo(scope: string, msg: string, data?: Record<string, unknown>): void {
  console.error("[sg-api]", JSON.stringify({ scope, ts: new Date().toISOString(), msg, ...data }));
}
