import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";

export default async function AdminCacheLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/cache");
  }
  if (!isAdminEmail(session.user.email)) {
    redirect("/admin/forbidden");
  }
  return children;
}
