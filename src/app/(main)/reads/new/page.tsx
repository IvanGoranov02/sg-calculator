import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ReadEditor } from "@/components/reads/ReadEditor";
import { isAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function NewReadPage() {
  const session = await auth().catch(() => null);
  if (!isAdminEmail(session?.user?.email)) redirect("/reads");
  return <ReadEditor post={null} />;
}
