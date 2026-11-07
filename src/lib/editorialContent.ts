import { z } from "zod";

export function safeMediaUrl(value: string): boolean {
  if (!value) return true;
  if (/^\/(?!\/)[^\\\s]*$/.test(value)) return true;
  if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value))
    return value.length <= 2_800_000;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}
const mediaUrl = z
  .string()
  .max(2_800_000)
  .refine(
    safeMediaUrl,
    "Use an HTTPS media URL or a PNG, JPEG, WebP or GIF image.",
  );
export const imageSchema = z.object({
  src: mediaUrl,
  alt: z.string().max(500).default(""),
  x: z.number().min(0).max(100).default(50),
  y: z.number().min(0).max(100).default(50),
});
export const blockSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().max(100),
    type: z.literal("paragraph"),
    text: z.string().max(100_000),
  }),
  z.object({
    id: z.string().max(100),
    type: z.literal("heading"),
    text: z.string().max(500),
  }),
  z.object({
    id: z.string().max(100),
    type: z.literal("image"),
    image: imageSchema,
    caption: z.string().max(1000).default(""),
  }),
  z.object({
    id: z.string().max(100),
    type: z.literal("video"),
    src: z
      .string()
      .max(2000)
      .url()
      .refine((v) => v.startsWith("https://")),
    caption: z.string().max(1000).default(""),
  }),
]);
export const articleSchema = z
  .object({
    title: z.string().trim().min(1).max(250),
    excerpt: z.string().max(1000),
    cover: imageSchema,
    blocks: z.array(blockSchema).max(250),
    published: z.boolean(),
  })
  .superRefine((a, ctx) => {
    if (
      a.published &&
      (!a.cover.src ||
        !a.blocks.some(
          (b) =>
            (b.type === "paragraph" || b.type === "heading") && b.text.trim(),
        ))
    )
      ctx.addIssue({
        code: "custom",
        message: "A published article needs a cover and text.",
      });
    if (new Set(a.blocks.map((b) => b.id)).size !== a.blocks.length)
      ctx.addIssue({ code: "custom", message: "Block IDs must be unique." });
  });
export type EditorialImage = z.infer<typeof imageSchema>;
export type ArticleBlock = z.infer<typeof blockSchema>;
export type ArticleInput = z.infer<typeof articleSchema>;
export type ArticleRecord = ArticleInput & {
  id: string;
  updatedAt: string;
  publishedAt: string | null;
};
export const emptyImage: EditorialImage = { src: "", alt: "", x: 50, y: 50 };
export function videoEmbedUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const id =
      u.hostname === "youtu.be"
        ? u.pathname.slice(1)
        : ["youtube.com", "www.youtube.com"].includes(u.hostname)
          ? u.searchParams.get("v")
          : null;
    if (id && /^[\w-]{11}$/.test(id))
      return `https://www.youtube-nocookie.com/embed/${id}`;
    if (
      ["vimeo.com", "www.vimeo.com"].includes(u.hostname) &&
      /^\/\d+$/.test(u.pathname)
    )
      return `https://player.vimeo.com/video${u.pathname}`;
  } catch {}
  return null;
}
