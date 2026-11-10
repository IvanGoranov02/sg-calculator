import { requireAdminSession } from "@/lib/admin";
import { saveReadImage } from "@/lib/reads";

export const dynamic = "force-dynamic";

/** Admin: upload an already-resized image as a data URL; returns the stable URL to embed. */
export async function POST(request: Request) {
  const gate = await requireAdminSession();
  if (!gate.ok) return Response.json({ error: "Forbidden" }, { status: gate.status });
  const body = (await request.json().catch(() => null)) as { data?: unknown } | null;
  if (!body || typeof body.data !== "string") return Response.json({ error: "Invalid image." }, { status: 400 });
  try {
    const url = await saveReadImage(body.data);
    if (!url) return Response.json({ error: "Invalid or too large image." }, { status: 400 });
    return Response.json({ url });
  } catch (e) {
    console.error("read image upload failed", e);
    return Response.json({ error: "Could not upload.", detail: e instanceof Error ? e.message.slice(-300) : "" }, { status: 500 });
  }
}
