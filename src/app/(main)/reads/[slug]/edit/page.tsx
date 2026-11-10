import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { ReadEditor } from "@/components/reads/ReadEditor";
import { isAdminEmail } from "@/lib/admin";
import { getReadBySlug } from "@/lib/reads";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

export default async function EditReadPage({ params }: PageProps) {
  const { slug } = await params;
  const session = await auth().catch(() => null);
  if (!isAdminEmail(session?.user?.email)) redirect(`/reads/${slug}`);
  const post = await getReadBySlug(decodeURIComponent(slug)).catch(() => null);
  if (!post) notFound();
  return <ReadEditor post={post} />;
}
