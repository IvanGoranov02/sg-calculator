import { requireAdminSession } from "@/lib/admin";
import {
  MAX_KEY_LENGTH,
  MAX_TEXT_LENGTH,
  parseImageOverride,
  readSiteContent,
  writeSiteContent,
} from "@/lib/siteContent";

export const dynamic = "force-dynamic";

/** Public: every visitor sees the edited texts and images. */
export async function GET() {
  try {
    const snapshot = await readSiteContent();
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ texts: {}, images: {} }, { headers: { "Cache-Control": "no-store" } });
  }
}

/** Admin only. Body: { kind: "text"|"image", key, value } — value null restores the original. */
export async function PUT(request: Request) {
  const gate = await requireAdminSession();
  if (!gate.ok) {
    return Response.json({ error: gate.status === 401 ? "Unauthorized" : "Forbidden" }, { status: gate.status });
  }
  let body: { kind?: unknown; key?: unknown; value?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const { kind, key, value } = body;
  if ((kind !== "text" && kind !== "image") || typeof key !== "string" || !key || key.length > MAX_KEY_LENGTH) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  try {
    if (value === null) {
      await writeSiteContent(kind, key, null);
    } else if (kind === "text") {
      if (typeof value !== "string" || value.length > MAX_TEXT_LENGTH) {
        return Response.json({ error: "Invalid text." }, { status: 400 });
      }
      await writeSiteContent("text", key, value);
    } else {
      const img = parseImageOverride(value);
      if (!img) return Response.json({ error: "Invalid image." }, { status: 400 });
      await writeSiteContent("image", key, img);
    }
    return Response.json({ ok: true });
  } catch (e) {
    const detail = e instanceof Error ? e.message.slice(-400) : String(e);
    console.error("site-content save failed", e);
    return Response.json({ error: "Could not save.", detail }, { status: 500 });
  }
}
