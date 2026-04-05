import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret, isPortfolioEncryptionConfigured } from "@/lib/portfolioEncryption";
import { prismaErrorToHttp } from "@/lib/prismaHttpError";
import { logApiException, logApiInfo } from "@/lib/serverDebugLog";
import type { Trading212Environment } from "@prisma/client";

function parseEnv(v: unknown): Trading212Environment | null {
  if (v === "demo" || v === "live") return v;
  return null;
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const row = await prisma.trading212Connection.findUnique({ where: { userId } });
    return Response.json({
      encryptionConfigured: isPortfolioEncryptionConfigured(),
      connected: !!row,
      environment: row?.environment ?? null,
      lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
      lastError: row?.lastError ?? null,
    });
  } catch (e) {
    const { status, error } = prismaErrorToHttp(e);
    return Response.json({ error }, { status });
  }
}

export async function PUT(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPortfolioEncryptionConfigured()) {
    logApiInfo("PUT /api/trading212/settings", "encryption not configured (no AUTH_SECRET / valid PORTFOLIO_ENCRYPTION_KEY)");
    return Response.json(
      {
        error:
          "Server cannot encrypt credentials: set AUTH_SECRET (required for sign-in anyway) or optionally PORTFOLIO_ENCRYPTION_KEY (openssl rand -base64 32). User T212 keys are encrypted with this before saving to the database.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const environment = parseEnv(o.environment);
  const apiKey = typeof o.apiKey === "string" ? o.apiKey.trim() : "";
  const apiSecret = typeof o.apiSecret === "string" ? o.apiSecret.trim() : "";

  try {
    const existing = await prisma.trading212Connection.findUnique({ where: { userId } });

    if (!environment && !existing) {
      return Response.json({ error: "environment is required when connecting for the first time" }, { status: 400 });
    }

    const nextEnv = environment ?? existing?.environment ?? "demo";

    if (apiKey.length > 0 && apiSecret.length > 0) {
      let apiKeyEnc: string;
      let apiSecretEnc: string;
      try {
        apiKeyEnc = encryptSecret(apiKey);
        apiSecretEnc = encryptSecret(apiSecret);
      } catch (encErr) {
        logApiException("PUT /api/trading212/settings encryptSecret", encErr, { userId });
        const msg = encErr instanceof Error ? encErr.message : "Encryption failed";
        return Response.json(
          {
            error: `Cannot encrypt credentials: ${msg}. Ensure AUTH_SECRET or PORTFOLIO_ENCRYPTION_KEY is set on the server.`,
          },
          { status: 503 },
        );
      }
      await prisma.trading212Connection.upsert({
        where: { userId },
        create: {
          userId,
          environment: nextEnv,
          apiKeyEnc,
          apiSecretEnc,
          lastError: null,
        },
        update: {
          environment: nextEnv,
          apiKeyEnc,
          apiSecretEnc,
          lastError: null,
        },
      });
    } else if (existing) {
      await prisma.trading212Connection.update({
        where: { userId },
        data: {
          environment: nextEnv,
        },
      });
    } else {
      return Response.json({ error: "apiKey and apiSecret are required to connect" }, { status: 400 });
    }

    const row = await prisma.trading212Connection.findUnique({ where: { userId } });
    return Response.json({
      encryptionConfigured: true,
      connected: !!row,
      environment: row?.environment ?? null,
      lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
      lastError: row?.lastError ?? null,
    });
  } catch (e) {
    const { status, error } = prismaErrorToHttp(e);
    return Response.json({ error }, { status });
  }
}

export async function DELETE() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.$transaction([
      prisma.portfolioHolding.deleteMany({ where: { userId, source: "t212" } }),
      prisma.trading212Connection.deleteMany({ where: { userId } }),
    ]);
    return Response.json({ ok: true });
  } catch (e) {
    const { status, error } = prismaErrorToHttp(e);
    return Response.json({ error }, { status });
  }
}
