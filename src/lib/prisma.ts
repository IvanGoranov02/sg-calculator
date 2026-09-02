import { PrismaClient } from "@prisma/client";

import { configurePooledDatabaseUrl } from "@/lib/prismaPool";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function datasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return undefined;
  return configurePooledDatabaseUrl(raw);
}

const url = datasourceUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(url ? { datasources: { db: { url } } } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
