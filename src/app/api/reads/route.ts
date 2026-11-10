import { requireAdminSession } from "@/lib/admin";
import { createRead, parseReadInput } from "@/lib/reads";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = await requireAdminSession();
  if (!gate.ok) return Response.json({ error: "Forbidden" }, { status: gate.status });
  const input = parseReadInput(await request.json().catch(() => null));
  if (!input) return Response.json({ error: "Invalid read." }, { status: 400 });
  try {
    const post = await createRead(input);
    return Response.json({ id: post.id, slug: post.slug });
  } catch (e) {
    console.error("create read failed", e);
    return Response.json({ error: "Could not save.", detail: e instanceof Error ? e.message.slice(-300) : "" }, { status: 500 });
  }
}
