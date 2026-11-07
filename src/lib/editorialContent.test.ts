import assert from "node:assert/strict";
import { it } from "node:test";
import {
  articleSchema,
  emptyImage,
  safeMediaUrl,
  videoEmbedUrl,
} from "./editorialContent";
import { siteContentSchema } from "./siteContentSchema";
it("rejects executable media URLs and requires a real cover and text before publication", () => {
  assert.equal(safeMediaUrl("javascript:alert(1)"), false);
  assert.equal(safeMediaUrl("data:image/svg+xml;base64,AAAA"), false);
  assert.equal(safeMediaUrl("https://example.com/a.png"), true);
  assert.equal(
    articleSchema.safeParse({
      title: "Draft",
      excerpt: "",
      cover: emptyImage,
      blocks: [],
      published: false,
    }).success,
    true,
  );
  assert.equal(
    articleSchema.safeParse({
      title: "Publish",
      excerpt: "",
      cover: emptyImage,
      blocks: [],
      published: true,
    }).success,
    false,
  );
  assert.equal(
    articleSchema.safeParse({
      title: "Publish",
      excerpt: "",
      cover: { ...emptyImage, src: "https://example.com/a.png" },
      blocks: [{ id: "p", type: "paragraph", text: "Text" }],
      published: true,
    }).success,
    true,
  );
});
it("only embeds supported video hosts and valid IDs", () => {
  assert.equal(
    videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ"),
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  );
  assert.equal(
    videoEmbedUrl("https://youtube.com.evil.test/?v=dQw4w9WgXcQ"),
    null,
  );
});
it("keeps translation placeholders and rejects invented keys", () => {
  const base = { en: {}, bg: {}, images: {}, version: null };
  assert.equal(
    siteContentSchema.safeParse({ ...base, en: { "nav.dashboard": "Markets" } })
      .success,
    true,
  );
  assert.equal(
    siteContentSchema.safeParse({ ...base, en: { "unknown.key": "Injected" } })
      .success,
    false,
  );
  assert.equal(
    siteContentSchema.safeParse({
      ...base,
      en: { "portfolio.valueHistoryProgress": "Removed placeholders" },
    }).success,
    false,
  );
});
