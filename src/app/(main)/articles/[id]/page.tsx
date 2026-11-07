import { Articles } from "@/components/content/Articles";
export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Articles id={id} />;
}
