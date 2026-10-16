import { auth } from "@/auth";
import { syncTrading212Positions } from "@/lib/syncTrading212Positions";

export const maxDuration = 60;

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return syncTrading212Positions(userId);
}
