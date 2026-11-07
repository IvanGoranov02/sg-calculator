"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MediaEditor } from "./MediaEditor";
import {
  articleSchema,
  emptyImage,
  type ArticleInput,
  type ArticleBlock,
  type ArticleRecord,
} from "@/lib/editorialContent";
import { useI18n } from "@/lib/i18n/LocaleProvider";
export function ArticleEditor({
  article,
  onCancel,
}: {
  article?: ArticleRecord;
  onCancel?: () => void;
}) {
  const { locale, t } = useI18n();
  const bg = locale === "bg";
  const router = useRouter();
  const [draft, setDraft] = useState<ArticleInput>(
    () =>
      article ?? {
        title: "",
        excerpt: "",
        cover: { ...emptyImage },
        blocks: [],
        published: false,
      },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(article?.updatedAt);
  const [id, setId] = useState(article?.id);
  function blockChange(index: number, block: ArticleBlock) {
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b, i) => (i === index ? block : b)),
    }));
  }
  function add(type: ArticleBlock["type"]) {
    const id = crypto.randomUUID();
    const block: ArticleBlock =
      type === "image"
        ? { id, type, image: { ...emptyImage }, caption: "" }
        : type === "video"
          ? { id, type, src: "", caption: "" }
          : { id, type, text: "" };
    setDraft((d) => ({ ...d, blocks: [...d.blocks, block] }));
  }
  function move(index: number, delta: number) {
    setDraft((d) => {
      const blocks = [...d.blocks];
      const target = index + delta;
      if (target < 0 || target >= blocks.length) return d;
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      return { ...d, blocks };
    });
  }
  async function save() {
    const parsed = articleSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues.map((e) => e.message).join(" "));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(id ? `/api/articles/${id}` : "/api/articles", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, updatedAt: version }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Save failed");
      setId(result.article.id);
      setVersion(result.article.updatedAt);
      router.push(`/articles/${result.article.id}`);
      router.refresh();
      onCancel?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      className="mx-auto max-w-3xl space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-8"
      data-editor-ui
    >
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {t("editorial.articleEditor")}
        </h1>
        <Button
          variant="ghost"
          onClick={() => (onCancel ? onCancel() : router.push("/articles"))}
        >
          {t("editorial.cancel")}
        </Button>
      </div>
      <label className="block space-y-1 text-sm">
        {t("editorial.title")}
        <Input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          maxLength={250}
        />
      </label>
      <label className="block space-y-1 text-sm">
        {t("editorial.excerpt")}
        <textarea
          className="min-h-24 w-full rounded-lg border border-input bg-background p-3"
          value={draft.excerpt}
          onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })}
          maxLength={1000}
        />
      </label>
      <MediaEditor
        image={draft.cover}
        onChange={(cover) => setDraft({ ...draft, cover })}
      />
      {draft.blocks.map((block, i) => (
        <div
          key={block.id}
          className="space-y-3 rounded-xl border border-border p-4"
        >
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <strong>
              {i + 1}. {block.type}
            </strong>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label={t("editorial.moveUp")}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={i === draft.blocks.length - 1}
                onClick={() => move(i, 1)}
                aria-label={t("editorial.moveDown")}
              >
                ↓
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setDraft({
                    ...draft,
                    blocks: draft.blocks.filter((b) => b.id !== block.id),
                  })
                }
              >
                {t("editorial.remove")}
              </Button>
            </div>
          </div>
          {block.type === "paragraph" || block.type === "heading" ? (
            <label className="block text-sm">
              {t("editorial.text")}
              <textarea
                className="mt-1 min-h-32 w-full rounded-lg border border-input bg-background p-3 leading-relaxed"
                value={block.text}
                onChange={(e) =>
                  blockChange(i, { ...block, text: e.target.value })
                }
              />
            </label>
          ) : block.type === "image" ? (
            <>
              <MediaEditor
                image={block.image}
                onChange={(image) => blockChange(i, { ...block, image })}
              />
              <Input
                aria-label={t("editorial.caption")}
                value={block.caption}
                onChange={(e) =>
                  blockChange(i, { ...block, caption: e.target.value })
                }
              />
            </>
          ) : (
            <>
              <label className="block text-sm">
                {t("editorial.hTTPSVideoURLMP4YouTubeOrVimeo")}
                <Input
                  value={block.src}
                  onChange={(e) =>
                    blockChange(i, { ...block, src: e.target.value })
                  }
                />
              </label>
              <Input
                aria-label={t("editorial.caption")}
                value={block.caption}
                onChange={(e) =>
                  blockChange(i, { ...block, caption: e.target.value })
                }
              />
            </>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {(["paragraph", "heading", "image", "video"] as const).map(
          (type, i) => (
            <Button
              key={type}
              type="button"
              variant="outline"
              onClick={() => add(type)}
            >
              +{" "}
              {bg
                ? ["Текст", "Подзаглавие", "Снимка", "Видео"][i]
                : ["Text", "Heading", "Image", "Video"][i]}
            </Button>
          ),
        )}
      </div>
      <div className="sticky bottom-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-lg lg:bottom-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.published}
            onChange={(e) =>
              setDraft({ ...draft, published: e.target.checked })
            }
          />
          {t("editorial.published")}
        </label>
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? t("editorial.saving") : t("editorial.saveArticle")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
