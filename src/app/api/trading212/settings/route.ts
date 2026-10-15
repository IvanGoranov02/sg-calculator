import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isPortfolioEncryptionConfigured } from "@/lib/portfolioEncryption";
import { prismaErrorToHttp } from "@/lib/prismaHttpError";
import { logApiInfo } from "@/lib/serverDebugLog";
import type { Trading212Environment } from "@prisma/client";

import { saveTrading212Connection, Trading212StateError } from "@/lib/trading212ConnectionState";
import { disconnectTrading212ForUser } from "@/lib/trading212Disconnect";
import { normalizeTrading212ErrorMessage } from "@/lib/trading212Errors";

export const maxDuration = 60;

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
      lastError: normalizeTrading212ErrorMessage(row?.lastError ?? null),
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

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Expected a JSON object" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const environment = parseEnv(o.environment);
  if (o.environment !== undefined && !environment) {
    return Response.json({ error: "environment must be demo or live" }, { status: 400 });
  }
  const apiKey = typeof o.apiKey === "string" ? o.apiKey.trim() : "";
  const apiSecret = typeof o.apiSecret === "string" ? o.apiSecret.trim() : "";

  try {
    await saveTrading212Connection({ userId, environment, apiKey, apiSecret });

    const row = await prisma.trading212Connection.findUnique({ where: { userId } });
    return Response.json({
      encryptionConfigured: true,
      connected: !!row,
      environment: row?.environment ?? null,
      lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
      lastError: normalizeTrading212ErrorMessage(row?.lastError ?? null),
    });
  } catch (e) {
    if (e instanceof Trading212StateError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
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
    await disconnectTrading212ForUser(userId);
    return Response.json({ ok: true });
  } catch (e) {
    const { status, error } = prismaErrorToHttp(e);
    return Response.json({ error }, { status });
  }
}
