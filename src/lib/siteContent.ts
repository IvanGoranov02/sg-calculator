import { prisma } from "@/lib/prisma";

/** Admin page-editor overrides (texts and images). Plain table, created on first use. */
export type SiteImageOverride = {
  /** New image (https URL or data:image/...). Missing = keep the original image, only reframe it. */
  src?: string;
  /** Pan, % of the frame (-250..250). */
  x: number;
  y: number;
  /** Zoom, 1..5. */
  zoom: number;
};

export type SiteContentSnapshot = {
  texts: Record<string, string>;
  images: Record<string, SiteImageOverride>;
};

export const MAX_TEXT_LENGTH = 4000;
export const MAX_IMAGE_SRC_LENGTH = 1_800_000;
export const MAX_KEY_LENGTH = 1200;

let ensured: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!ensured) {
    ensured = prisma
      .$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "SitePageEdit" (
          "key" TEXT PRIMARY KEY,
          "kind" TEXT NOT NULL,
          "value" JSONB NOT NULL,
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
      )
      .then(() => prisma.$executeRawUnsafe(`ALTER TABLE "SitePageEdit" ENABLE ROW LEVEL SECURITY`))
      .then(() =>
        // Same lock-down as prisma/lock-supabase-api.sql: only Prisma (postgres role) may touch it.
        prisma.$executeRawUnsafe(`REVOKE ALL ON TABLE "SitePageEdit" FROM anon, authenticated`).catch(() => 0),
      )
      .then(() => undefined)
      .catch((e) => {
        ensured = null;
        throw e;
      });
  }
  return ensured;
}

export async function readSiteContent(): Promise<SiteContentSnapshot> {
  await ensureTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ key: string; kind: string; value: unknown }>>(
    `SELECT "key", "kind", "value" FROM "SitePageEdit"`,
  );
  const out: SiteContentSnapshot = { texts: {}, images: {} };
  for (const r of rows) {
    if (r.kind === "text" && typeof r.value === "string") out.texts[r.key] = r.value;
    else if (r.kind === "image" && r.value && typeof r.value === "object") {
      out.images[r.key] = r.value as SiteImageOverride;
    }
  }
  return out;
}

export async function writeSiteContent(
  kind: "text" | "image",
  key: string,
  value: string | SiteImageOverride | null,
): Promise<void> {
  await ensureTable();
  if (value === null) {
    await prisma.$executeRawUnsafe(`DELETE FROM "SitePageEdit" WHERE "key" = $1 AND "kind" = $2`, key, kind);
    return;
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SitePageEdit" ("key","kind","value","updatedAt") VALUES ($1,$2,$3::jsonb,now())
     ON CONFLICT ("key") DO UPDATE SET "kind" = EXCLUDED."kind", "value" = EXCLUDED."value", "updatedAt" = now()`,
    key,
    kind,
    JSON.stringify(value),
  );
}

export function parseImageOverride(raw: unknown): SiteImageOverride | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, min: number, max: number, d: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
  let src: string | undefined;
  if (typeof o.src === "string" && o.src) {
    if (o.src.length > MAX_IMAGE_SRC_LENGTH) return null;
    if (!/^https:\/\//i.test(o.src) && !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(o.src)) return null;
    src = o.src;
  }
  return { ...(src ? { src } : {}), x: num(o.x, -250, 250, 0), y: num(o.y, -250, 250, 0), zoom: num(o.zoom, 1, 5, 1) };
}
