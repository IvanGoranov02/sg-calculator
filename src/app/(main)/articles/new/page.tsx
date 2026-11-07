import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/admin";
import { ArticleEditor } from "@/components/content/ArticleEditor";
export default async function NewArticlePage() {
  const admin = await requireAdminSession();
  if (!admin.ok) redirect("/login");
  return <ArticleEditor />;
}
