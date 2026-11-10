import { randomBytes } from "node:crypto";

import { SEED_READS } from "@/data/seedReads";
import { prisma } from "@/lib/prisma";

/** "Reads": long-form posts published by admins. Own tables, created on first use, RLS-locked. */

export type ReadBlock =
  | { type: "heading"; text: string; sub?: boolean }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "table"; rows: string[][] }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "image"; src: string; caption?: string }
  | { type: "video"; url: string; caption?: string }
  | { type: "divider" };

export type ReadPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  cover: string | null;
  blocks: ReadBlock[];
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  minutes: number;
};

export type ReadSummary = Omit<ReadPost, "blocks">;

const LIMITS = { title: 200, excerpt: 600, text: 20_000, blocks: 400, url: 2000, caption: 500 };

let ensured: Promise<void> | null = null;
function ensureTables(): Promise<void> {
  if (!ensured) {
    const run = async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ReadPost" (
        "id" TEXT PRIMARY KEY, "slug" TEXT NOT NULL UNIQUE, "title" TEXT NOT NULL,
        "excerpt" TEXT NOT NULL DEFAULT '', "cover" TEXT, "blocks" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "status" TEXT NOT NULL DEFAULT 'draft', "minutes" INT NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "publishedAt" TIMESTAMPTZ)`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ReadImage" (
        "id" TEXT PRIMARY KEY, "mime" TEXT NOT NULL, "data" BYTEA NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ReadMeta" ("key" TEXT PRIMARY KEY)`);
      for (const t of ["ReadPost", "ReadImage", "ReadMeta"]) {
        await prisma.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`);
        await prisma.$executeRawUnsafe(`REVOKE ALL ON TABLE "${t}" FROM anon, authenticated`).catch(() => 0);
      }
      // Built-in first reads are inserted once; deleting one in the editor keeps it deleted.
      for (const seed of SEED_READS) {
        const claimed = await prisma.$queryRawUnsafe<{ key: string }[]>(
          `INSERT INTO "ReadMeta" ("key") VALUES ($1) ON CONFLICT DO NOTHING RETURNING "key"`,
          `seed:${seed.slug}`,
        );
        if (claimed.length === 0) continue;
        await prisma.$executeRawUnsafe(
          `INSERT INTO "ReadPost" ("id","slug","title","excerpt","cover","blocks","status","minutes","publishedAt")
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,'published',$7, now()) ON CONFLICT ("slug") DO NOTHING`,
          randomBytes(9).toString("hex"),
          seed.slug,
          seed.title,
          seed.excerpt,
          seed.cover,
          JSON.stringify(seed.blocks),
          estimateMinutes(seed.blocks),
        );
      }
    };
    ensured = run().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya",
};

export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .split("")
    .map((c) => CYR[c] ?? c)
    .join("")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return base || "read";
}

export function estimateMinutes(blocks: ReadBlock[]): number {
  let words = 0;
  for (const b of blocks) {
    if (b.type === "heading" || b.type === "paragraph" || b.type === "quote") {
      words += b.text.trim().split(/\s+/).filter(Boolean).length;
    } else if (b.type === "list") {
      words += b.items.join(" ").trim().split(/\s+/).filter(Boolean).length;
    } else if (b.type === "table") {
      words += b.rows.flat().join(" ").trim().split(/\s+/).filter(Boolean).length;
    }
  }
  const media = blocks.filter((b) => b.type === "image" || b.type === "video").length;
  return Math.max(1, Math.round(words / 200 + media * 0.1));
}

function okUrl(u: unknown, allowLocalImage: boolean): u is string {
  if (typeof u !== "string" || !u || u.length > LIMITS.url) return false;
  if (/^https:\/\//i.test(u)) return true;
  return allowLocalImage && /^(\/api\/reads\/image\/[a-z0-9]{8,40}|\/read-media\/[a-z0-9._\/-]{1,120})$/i.test(u);
}

export function sanitizeBlocks(raw: unknown): ReadBlock[] | null {
  if (!Array.isArray(raw) || raw.length > LIMITS.blocks) return null;
  const out: ReadBlock[] = [];
  for (const b of raw) {
    if (!b || typeof b !== "object") return null;
    const o = b as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.slice(0, LIMITS.text) : "";
    const caption = typeof o.caption === "string" ? o.caption.slice(0, LIMITS.caption) : undefined;
    switch (o.type) {
      case "heading":
        out.push({ type: "heading", text, ...(o.sub === true ? { sub: true } : {}) });
        break;
      case "paragraph":
      case "quote":
        out.push({ type: o.type, text });
        break;
      case "list": {
        if (!Array.isArray(o.items) || o.items.length > 200) return null;
        const items = o.items.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 2000));
        out.push({ type: "list", items, ...(o.ordered === true ? { ordered: true } : {}) });
        break;
      }
      case "table": {
        if (!Array.isArray(o.rows) || o.rows.length > 100) return null;
        const rows = o.rows
          .filter((r): r is unknown[] => Array.isArray(r) && r.length <= 8)
          .map((r) => r.map((c) => (typeof c === "string" ? c.slice(0, 500) : "")));
        out.push({ type: "table", rows });
        break;
      }
      case "image":
        if (!okUrl(o.src, true)) return null;
        out.push({ type: "image", src: o.src as string, ...(caption ? { caption } : {}) });
        break;
      case "video":
        if (!okUrl(o.url, false)) return null;
        out.push({ type: "video", url: o.url as string, ...(caption ? { caption } : {}) });
        break;
      case "divider":
        out.push({ type: "divider" });
        break;
      default:
        return null;
    }
  }
  return out;
}

export type ReadInput = {
  title: string;
  excerpt: string;
  cover: string | null;
  blocks: ReadBlock[];
  status: "draft" | "published";
};

export function parseReadInput(raw: unknown): ReadInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim().slice(0, LIMITS.title) : "";
  if (!title) return null;
  const blocks = sanitizeBlocks(o.blocks ?? []);
  if (!blocks) return null;
  let cover: string | null = null;
  if (typeof o.cover === "string" && o.cover) {
    if (!okUrl(o.cover, true)) return null;
    cover = o.cover;
  }
  const excerpt = typeof o.excerpt === "string" ? o.excerpt.trim().slice(0, LIMITS.excerpt) : "";
  return { title, excerpt, cover, blocks, status: o.status === "published" ? "published" : "draft" };
}

type Row = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  cover: string | null;
  blocks?: unknown;
  status: string;
  minutes: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
};

function toPost(r: Row): ReadPost {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    cover: r.cover,
    blocks: Array.isArray(r.blocks) ? (r.blocks as ReadBlock[]) : [],
    status: r.status === "published" ? "published" : "draft",
    minutes: r.minutes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    publishedAt: r.publishedAt?.toISOString() ?? null,
  };
}

export async function listReads(includeDrafts: boolean): Promise<ReadSummary[]> {
  await ensureTables();
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT "id","slug","title","excerpt","cover","status","minutes","createdAt","updatedAt","publishedAt"
     FROM "ReadPost" ${includeDrafts ? "" : `WHERE "status" = 'published'`}
     ORDER BY COALESCE("publishedAt","createdAt") DESC`,
  );
  return rows.map((r) => {
    const post = toPost(r) as Partial<ReadPost>;
    delete post.blocks;
    return post as ReadSummary;
  });
}

export async function getReadBySlug(slug: string): Promise<ReadPost | null> {
  await ensureTables();
  const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM "ReadPost" WHERE "slug" = $1`, slug);
  return rows[0] ? toPost(rows[0]) : null;
}

export async function getReadById(id: string): Promise<ReadPost | null> {
  await ensureTables();
  const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM "ReadPost" WHERE "id" = $1`, id);
  return rows[0] ? toPost(rows[0]) : null;
}

function newId(): string {
  return randomBytes(9).toString("hex");
}

async function uniqueSlug(title: string, exceptId?: string): Promise<string> {
  const base = slugify(title);
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "id" FROM "ReadPost" WHERE "slug" = $1`,
      candidate,
    );
    if (!rows[0] || rows[0].id === exceptId) return candidate;
  }
  return `${base}-${newId()}`;
}

export async function createRead(input: ReadInput): Promise<ReadPost> {
  await ensureTables();
  const id = newId();
  const slug = await uniqueSlug(input.title);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ReadPost" ("id","slug","title","excerpt","cover","blocks","status","minutes","publishedAt")
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8, CASE WHEN $7 = 'published' THEN now() ELSE NULL END)`,
    id,
    slug,
    input.title,
    input.excerpt,
    input.cover,
    JSON.stringify(input.blocks),
    input.status,
    estimateMinutes(input.blocks),
  );
  return (await getReadById(id))!;
}

export async function updateRead(id: string, input: ReadInput): Promise<ReadPost | null> {
  await ensureTables();
  const prev = await getReadById(id);
  if (!prev) return null;
  const slug = prev.title === input.title ? prev.slug : await uniqueSlug(input.title, id);
  await prisma.$executeRawUnsafe(
    `UPDATE "ReadPost" SET "slug"=$2,"title"=$3,"excerpt"=$4,"cover"=$5,"blocks"=$6::jsonb,"status"=$7,"minutes"=$8,
       "updatedAt"=now(),
       "publishedAt"= CASE WHEN $7 = 'published' THEN COALESCE("publishedAt", now()) ELSE "publishedAt" END
     WHERE "id"=$1`,
    id,
    slug,
    input.title,
    input.excerpt,
    input.cover,
    JSON.stringify(input.blocks),
    input.status,
    estimateMinutes(input.blocks),
  );
  return getReadById(id);
}

export async function deleteRead(id: string): Promise<void> {
  await ensureTables();
  await prisma.$executeRawUnsafe(`DELETE FROM "ReadPost" WHERE "id" = $1`, id);
}

export async function saveReadImage(dataUrl: string): Promise<string | null> {
  const m = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  if (buf.length === 0 || buf.length > 3_000_000) return null;
  await ensureTables();
  const id = newId();
  await prisma.$executeRawUnsafe(`INSERT INTO "ReadImage" ("id","mime","data") VALUES ($1,$2,$3)`, id, m[1], buf);
  return `/api/reads/image/${id}`;
}

export async function getReadImage(id: string): Promise<{ mime: string; data: Buffer } | null> {
  if (!/^[a-z0-9]{8,40}$/i.test(id)) return null;
  await ensureTables();
  const rows = await prisma.$queryRawUnsafe<{ mime: string; data: Buffer }[]>(
    `SELECT "mime","data" FROM "ReadImage" WHERE "id" = $1`,
    id,
  );
  return rows[0] ?? null;
}
