import { prisma } from "@/lib/prisma";

/**
 * Remove broker connection (including cached order history and any recorded history scope),
 * synced holdings, and T212-derived portfolio snapshots.
 * The next connect starts with an empty series and re-probes `history:orders`.
 */
export async function disconnectTrading212ForUser(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.portfolioHolding.deleteMany({ where: { userId, source: "t212" } }),
    prisma.portfolioAccountSnapshot.deleteMany({ where: { userId } }),
    prisma.trading212Connection.deleteMany({ where: { userId } }),
  ]);
}
