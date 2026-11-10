import { requireAdminSession } from "@/lib/admin";
import { deleteRead, parseReadInput, updateRead } from "@/lib/reads";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, ctx: Ctx) {
  const gate = await requireAdminSession();
  if (!gate.ok) return Response.json({ error: "Forbidden" }, { status: gate.status });
  const { id } = await ctx.params;
  const input = parseReadInput(await request.json().catch(() => null));
  if (!input) return Response.json({ error: "Invalid read." }, { status: 400 });
  try {
    const post = await updateRead(id, input);
    if (!post) return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json({ id: post.id, slug: post.slug });
  } catch (e) {
    console.error("update read failed", e);
    return Response.json({ error: "Could not save.", detail: e instanceof Error ? e.message.slice(-300) : "" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const gate = await requireAdminSession();
  if (!gate.ok) return Response.json({ error: "Forbidden" }, { status: gate.status });
  const { id } = await ctx.params;
  try {
    await deleteRead(id);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Could not delete." }, { status: 500 });
  }
}
