import { Prisma, type PrismaClient, type Trading212Connection, type Trading212Environment } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/portfolioEncryption";
import { clearedT212OrdersCacheData } from "@/lib/t212OrderHistory";
import { mapT212PositionToHolding, mergeT212HoldingRows } from "@/lib/t212PositionSync";
import { fetchT212AccountSummary, t212HoldingsMarketValue, type T212AccountSummary, type T212Position } from "@/lib/trading212Client";

export class Trading212StateError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "Trading212StateError";
  }
}

export type Trading212StateDatabase = Pick<PrismaClient, "$transaction" | "trading212Connection">;

export type Trading212CredentialsGeneration = {
  id: string;
  environment: Trading212Environment;
  apiKeyEnc: string;
  apiSecretEnc: string;
};

/** Ciphertext changes on every credentials save, including a rotation for the same account. */
export function trading212CredentialsWhere(userId: string, generation: Trading212CredentialsGeneration) {
  return {
    userId,
    id: generation.id,
    environment: generation.environment,
    apiKeyEnc: generation.apiKeyEnc,
    apiSecretEnc: generation.apiSecretEnc,
  };
}

export async function recordTrading212SyncError(userId: string, connection: Trading212Connection, message: string, db: Trading212StateDatabase = prisma) {
  await db.trading212Connection.updateMany({
    where: { ...trading212CredentialsWhere(userId, connection), lastSyncAt: connection.lastSyncAt },
    data: { lastError: message.slice(0, 2000) },
  });
}

export function t212AccountId(summary: T212AccountSummary | null): string | null {
  const id = summary?.id;
  if (typeof id === "number") return Number.isSafeInteger(id) && id > 0 ? String(id) : null;
  if (typeof id === "string" && /^[0-9]{1,30}$/.test(id.trim())) {
    const canonical = id.trim().replace(/^0+/, "");
    return canonical || null;
  }
  return null;
}

function clearedBrokerHistory(): Prisma.Trading212ConnectionUpdateManyMutationInput {
  return {
    ...clearedT212OrdersCacheData(),
    dividendsCache: Prisma.DbNull,
    dividendsCachedAt: null,
    dividendsCacheError: null,
    dividendsCachePartial: false,
    lastSyncAt: null,
    lastError: null,
  };
}

/** Verify identity outside the transaction; claim its original generation before changing any broker rows. */
export async function saveTrading212Connection(input: {
  userId: string;
  environment: Trading212Environment | null;
  apiKey: string;
  apiSecret: string;
}, db: Trading212StateDatabase = prisma): Promise<void> {
  const { userId, apiKey, apiSecret } = input;
  const savingCredentials = Boolean(apiKey && apiSecret);
  if (Boolean(apiKey) !== Boolean(apiSecret)) {
    throw new Trading212StateError("apiKey and apiSecret must be supplied together", 400);
  }
  const existing = await db.trading212Connection.findUnique({ where: { userId } });
  if (!existing && (!input.environment || !savingCredentials)) {
    throw new Trading212StateError("environment, apiKey and apiSecret are required to connect", 400);
  }
  const environment = input.environment ?? existing?.environment ?? "demo";
  if (existing && !savingCredentials && environment === existing.environment) return;

  let oldKey: string | null = null;
  let oldSecret: string | null = null;
  if (existing) {
    try {
      oldKey = decryptSecret(existing.apiKeyEnc);
      oldSecret = decryptSecret(existing.apiSecretEnc);
    } catch {
      if (!savingCredentials) throw new Trading212StateError("Failed to decrypt credentials", 500);
    }
  }
  const nextKey = savingCredentials ? apiKey : oldKey!;
  const nextSecret = savingCredentials ? apiSecret : oldSecret!;
  const environmentChanged = Boolean(existing && environment !== existing.environment);
  const identicalCredentials = Boolean(existing && oldKey === nextKey && oldSecret === nextSecret);
  const newSummary = identicalCredentials && !environmentChanged
    ? null
    : await fetchT212AccountSummary(environment, nextKey, nextSecret, { timeoutMs: 10_000 });
  const newAccountId = t212AccountId(newSummary);
  let oldAccountId = existing?.accountId ?? null;

  if (existing && !environmentChanged && !identicalCredentials) {
    if (!oldAccountId && oldKey && oldSecret) {
      oldAccountId = t212AccountId(await fetchT212AccountSummary(
        existing.environment, oldKey, oldSecret, { timeoutMs: 10_000 },
      ));
    }
    if (!oldAccountId || !newAccountId) {
      throw new Trading212StateError(
        "Could not verify the Trading 212 account. Your saved data was kept. Sync with the current credentials before rotating keys, or disconnect before connecting another account.",
        409,
      );
    }
  }

  const changedAccount = Boolean(existing && (environmentChanged || (
    !identicalCredentials && oldAccountId !== newAccountId
  )));
  const accountId = identicalCredentials && !environmentChanged ? oldAccountId : newAccountId;
  // Rotate the generation on environment-only saves as well. Returning to a
  // previous environment must not make an older in-flight request current again.
  const rotateGeneration = savingCredentials || environmentChanged;
  const nextApiKeyEnc = rotateGeneration ? encryptSecret(nextKey) : existing!.apiKeyEnc;
  const nextApiSecretEnc = rotateGeneration ? encryptSecret(nextSecret) : existing!.apiSecretEnc;
  const data = {
    environment,
    // A concurrent sync may establish a legacy identity while this save runs.
    // An unverified identical-key save must not erase that newly learned ID.
    ...(accountId ? { accountId } : changedAccount ? { accountId: null } : {}),
    apiKeyEnc: nextApiKeyEnc,
    apiSecretEnc: nextApiSecretEnc,
    lastError: null,
    ...(changedAccount ? clearedBrokerHistory() : {}),
  };

  await db.$transaction(async (tx) => {
    if (!existing) {
      await tx.trading212Connection.create({
        data: { userId, environment, accountId, apiKeyEnc: nextApiKeyEnc, apiSecretEnc: nextApiSecretEnc },
      });
      return;
    }
    // UPDATE obtains the row lock first. Sync/disconnect use the same lock order.
    const claimed = await tx.trading212Connection.updateMany({
      where: trading212CredentialsWhere(userId, existing),
      data,
    });
    if (claimed.count === 0) throw new Trading212StateError("Trading 212 settings changed. Reload and try again.", 409);
    if (changedAccount) {
      await tx.portfolioHolding.deleteMany({ where: { userId, source: "t212" } });
      await tx.portfolioAccountSnapshot.deleteMany({ where: { userId } });
    }
  });
}

/** A complete empty positions response is valid after the last investment is sold. */
export async function commitTrading212Sync(input: {
  userId: string;
  connection: Trading212Connection;
  positions: T212Position[];
  summary: T212AccountSummary | null;
}, db: Trading212StateDatabase = prisma) {
  const { userId, connection, positions, summary } = input;
  const accountId = t212AccountId(summary);
  if (connection.accountId && accountId && connection.accountId !== accountId) {
    throw new Trading212StateError("Trading 212 returned a different account. Reconnect before syncing.", 409);
  }
  const accountCurrency = summary?.currency ?? null;
  const holdingsValue = summary ? t212HoldingsMarketValue(summary) : null;
  if (positions.length === 0 && holdingsValue != null && holdingsValue > 0.01) {
    throw new Trading212StateError("Trading 212 returned no positions but reported investments. Your saved holdings were kept.", 502);
  }
  const mapped = positions.flatMap((position) => {
    const row = mapT212PositionToHolding(position, userId, accountCurrency);
    return row ? [row] : [];
  });
  if (positions.length > 0 && mapped.length === 0) {
    throw new Trading212StateError("Trading 212 positions could not be mapped. Your saved holdings were kept.", 502);
  }
  return db.$transaction(async (tx) => {
    const claimed = await tx.trading212Connection.updateMany({
      where: { ...trading212CredentialsWhere(userId, connection), lastSyncAt: connection.lastSyncAt },
      data: {
        lastSyncAt: new Date(Math.max(Date.now(), (connection.lastSyncAt?.getTime() ?? 0) + 1)),
        lastError: null,
        ...(accountId ? { accountId } : {}),
      },
    });
    if (claimed.count === 0) throw new Trading212StateError("Trading 212 changed while syncing. Reload and try again.", 409);
    const manualRows = await tx.portfolioHolding.findMany({
      where: { userId, source: "manual" }, select: { symbolYahoo: true },
    });
    const manualSymbols = new Set(manualRows.map((row) => row.symbolYahoo));
    const skippedDueToManual: string[] = [];
    const mergedRows = mergeT212HoldingRows(mapped).filter((row) => {
      if (!manualSymbols.has(row.symbolYahoo)) return true;
      skippedDueToManual.push(row.symbolYahoo);
      return false;
    });
    await tx.portfolioHolding.deleteMany({ where: { userId, source: "t212" } });
    if (mergedRows.length > 0) await tx.portfolioHolding.createMany({ data: mergedRows });
    if (holdingsValue != null) {
      await tx.portfolioAccountSnapshot.create({
        data: { userId, totalValue: new Prisma.Decimal(holdingsValue), currency: accountCurrency ?? "USD" },
      });
    }
    return { positionsReceived: positions.length, positionsMapped: mapped.length, positionsSynced: mergedRows.length, skippedDueToManual };
  });
}
