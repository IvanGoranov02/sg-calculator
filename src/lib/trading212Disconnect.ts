import { prisma } from "@/lib/prisma";
import type { Trading212StateDatabase } from "@/lib/trading212ConnectionState";

/**
 * Remove broker connection (including cached order history and any recorded history scope),
 * synced holdings, and T212-derived portfolio snapshots.
 * The next connect starts with an empty series and re-probes `history:orders`.
 */
export async function disconnectTrading212ForUser(userId: string, db: Trading212StateDatabase = prisma): Promise<void> {
  await db.$transaction(async (tx) => {
    // Claim/delete the connection first, matching the lock order of saves and syncs.
    await tx.trading212Connection.deleteMany({ where: { userId } });
    await tx.portfolioHolding.deleteMany({ where: { userId, source: "t212" } });
    await tx.portfolioAccountSnapshot.deleteMany({ where: { userId } });
  });
}
