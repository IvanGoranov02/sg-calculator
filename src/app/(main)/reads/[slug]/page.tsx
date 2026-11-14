import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { ReadArticleClient } from "@/components/reads/ReadArticleClient";
import { isAdminEmail } from "@/lib/admin";
import { getReadBySlug } from "@/lib/reads";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getReadBySlug(decodeURIComponent(slug)).catch(() => null);
  return { title: post && post.status !== "draft" ? post.title : "Reads" };
}

export default async function ReadPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getReadBySlug(decodeURIComponent(slug)).catch(() => null);
  if (!post) notFound();
  const session = await auth().catch(() => null);
  const isAdmin = isAdminEmail(session?.user?.email);
  // Drafts are visible to admins only.
  if (post.status === "draft" && !isAdmin) notFound();
  return <ReadArticleClient post={post} isAdmin={isAdmin} />;
}
