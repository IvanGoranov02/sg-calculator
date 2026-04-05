import { Prisma } from "@prisma/client";

export function isPrismaInfrastructureError(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError ||
    e instanceof Prisma.PrismaClientInitializationError ||
    e instanceof Prisma.PrismaClientRustPanicError
  );
}

/**
 * Map Prisma failures to HTTP responses (avoids opaque 500s when migrations are missing, etc.).
 */
export function prismaErrorToHttp(e: unknown): { status: number; error: string } {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2021" || e.code === "P2022") {
      return {
        status: 503,
        error:
          "Database is missing portfolio tables. Run migrations on production: prisma migrate deploy (add it to your Vercel build command if needed), then redeploy.",
      };
    }
  }
  if (e instanceof Prisma.PrismaClientInitializationError) {
    return {
      status: 503,
      error: "Cannot connect to the database. Check DATABASE_URL on the server.",
    };
  }
  if (e instanceof Prisma.PrismaClientRustPanicError) {
    return { status: 503, error: "Database driver error. Check server logs." };
  }
  console.error("[prisma]", e);
  return { status: 500, error: "Database error. Try again later." };
}
