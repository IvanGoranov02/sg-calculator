import type { Article } from "@prisma/client";
import { articleSchema } from "@/lib/editorialContent";
export function serializeArticle(row: Article) {
  const data = articleSchema.parse(row);
  return {
    ...data,
    id: row.id,
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}
export async function readEditorialJson(request: Request): Promise<unknown> {
  // Vercel functions have a request size limit; keep inline image documents beneath it.
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 4_000_000)
    throw new Error(
      "This article is too large. Use hosted HTTPS URLs for larger images and videos.",
    );
  return JSON.parse(text);
}
