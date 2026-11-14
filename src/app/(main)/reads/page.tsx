import type { Metadata } from "next";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { listReads, type ReadSummary } from "@/lib/reads";
import { ReadsIndexClient } from "@/components/reads/ReadsIndexClient";

export const metadata: Metadata = { title: "Reads" };

export const dynamic = "force-dynamic";

export default async function ReadsPage() {
  const session = await auth().catch(() => null);
  const isAdmin = isAdminEmail(session?.user?.email);
  let posts: ReadSummary[] = [];
  try {
    posts = await listReads(isAdmin);
  } catch (e) {
    console.error("listReads failed", e);
  }
  return <ReadsIndexClient posts={posts} isAdmin={isAdmin} />;
}
