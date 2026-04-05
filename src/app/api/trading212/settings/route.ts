import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret, isPortfolioEncryptionConfigured } from "@/lib/portfolioEncryption";
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

  const row = await prisma.trading212Connection.findUnique({ where: { userId } });
  return Response.json({
    encryptionConfigured: isPortfolioEncryptionConfigured(),
    connected: !!row,
    environment: row?.environment ?? null,
    lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
    lastError: row?.lastError ?? null,
  });
}

export async function PUT(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPortfolioEncryptionConfigured()) {
    return Response.json(
      {
        error:
          "Add PORTFOLIO_ENCRYPTION_KEY to your server environment (e.g. Vercel → Environment Variables). Value: base64 of 32 random bytes (run: openssl rand -base64 32). Redeploy after adding. This is not the Gemini key.",
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

  const existing = await prisma.trading212Connection.findUnique({ where: { userId } });

  if (!environment && !existing) {
    return Response.json({ error: "environment is required when connecting for the first time" }, { status: 400 });
  }

  const nextEnv = environment ?? existing?.environment ?? "demo";

  if (apiKey.length > 0 && apiSecret.length > 0) {
    const apiKeyEnc = encryptSecret(apiKey);
    const apiSecretEnc = encryptSecret(apiSecret);
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
}

export async function DELETE() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.$transaction([
    prisma.portfolioHolding.deleteMany({ where: { userId, source: "t212" } }),
    prisma.trading212Connection.deleteMany({ where: { userId } }),
  ]);

  return Response.json({ ok: true });
}
