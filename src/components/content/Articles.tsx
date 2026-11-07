"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { type ArticleRecord, videoEmbedUrl } from "@/lib/editorialContent";
import { EditorialPhoto } from "./MediaEditor";
import { ArticleEditor } from "./ArticleEditor";
export function Articles({ id }: { id?: string }) {
  const { t } = useI18n();
  const { data: session } = useSession();
  const admin = !!session?.user?.isAdmin;
  const [articles, setArticles] = useState<ArticleRecord[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setError("");
      try {
        const res = await fetch(id ? `/api/articles/${id}` : "/api/articles", {
          signal,
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load articles.");
        if (!signal?.aborted) setArticles(id ? [data.article] : data.articles);
      } catch (e) {
        if (!signal?.aborted)
          setError(e instanceof Error ? e.message : "Could not load articles.");
      }
    },
    [id],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, admin]);
  if (error)
    return (
      <div className="mx-auto max-w-3xl space-y-3 rounded-xl border border-border bg-card p-6">
        <p role="alert">{error}</p>
        <Button onClick={() => void load()}>{t("editorial.retry")}</Button>
      </div>
    );
  if (!articles)
    return (
      <p role="status" className="p-6 text-muted-foreground">
        {t("editorial.loadingArticles")}
      </p>
    );
  if (id && articles[0]) {
    const article = articles[0];
    if (editing && admin)
      return (
        <ArticleEditor
          article={article}
          onCancel={() => {
            setEditing(false);
            void load();
          }}
        />
      );
    const words = article.blocks.reduce(
      (n, b) => n + ("text" in b ? b.text.trim().split(/\s+/).length : 0),
      0,
    );
    return (
      <article className="mx-auto max-w-4xl space-y-7 pb-12">
        <div className="flex items-center justify-between">
          <Link href="/articles" className="text-sm text-primary">
            ← {t("editorial.allArticles")}
          </Link>
          {admin ? (
            <Button variant="outline" onClick={() => setEditing(true)}>
              {t("editorial.editArticle")}
            </Button>
          ) : null}
        </div>
        <header className="mx-auto max-w-3xl space-y-4">
          <p className="text-sm font-medium text-primary">
            {article.published ? t("editorial.article") : t("editorial.draft")}{" "}
            · {Math.max(1, Math.ceil(words / 200))} {t("editorial.minRead")}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            {article.title}
          </h1>
          <p className="text-lg leading-relaxed text-muted-foreground">
            {article.excerpt}
          </p>
        </header>
        <EditorialPhoto image={article.cover} />
        <div className="mx-auto max-w-3xl space-y-7 text-[1.05rem] leading-[1.85]">
          {article.blocks.map((b) =>
            b.type === "heading" ? (
              <h2
                key={b.id}
                className="pt-5 text-2xl font-semibold leading-snug"
              >
                {b.text}
              </h2>
            ) : b.type === "paragraph" ? (
              <div key={b.id} className="space-y-5">
                {b.text.split(/\n\s*\n/).map((p, i) => (
                  <p key={i} className="whitespace-pre-wrap">
                    {p}
                  </p>
                ))}
              </div>
            ) : b.type === "image" ? (
              <figure key={b.id}>
                <EditorialPhoto image={b.image} />
                {b.caption ? (
                  <figcaption className="mt-2 text-center text-sm text-muted-foreground">
                    {b.caption}
                  </figcaption>
                ) : null}
              </figure>
            ) : (
              <figure key={b.id}>
                {videoEmbedUrl(b.src) ? (
                  <iframe
                    className="aspect-video w-full rounded-xl"
                    src={videoEmbedUrl(b.src)!}
                    title={b.caption || article.title}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                    sandbox="allow-scripts allow-same-origin allow-presentation"
                  />
                ) : (
                  <video
                    className="w-full rounded-xl"
                    src={b.src}
                    controls
                    preload="metadata"
                  />
                )}
                {b.caption ? (
                  <figcaption className="mt-2 text-sm text-muted-foreground">
                    {b.caption}
                  </figcaption>
                ) : null}
              </figure>
            ),
          )}
        </div>
      </article>
    );
  }
  return (
    <section className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-medium text-primary">
            {t("editorial.ideasPerspectives")}
          </p>
          <h1 className="text-3xl font-semibold">{t("editorial.articles")}</h1>
          <p className="mt-2 text-muted-foreground">
            {t("editorial.analysisInvestingIdeasAndACloserLook")}
          </p>
        </div>
        {admin ? (
          <Link className={buttonVariants()} href="/articles/new">
            + {t("editorial.newArticle")}
          </Link>
        ) : null}
      </header>
      {articles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          {t("editorial.noPublishedArticlesYet")}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {articles.map((a) => (
            <Link
              key={a.id}
              href={`/articles/${a.id}`}
              className="group overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-lg"
            >
              <EditorialPhoto
                image={a.cover}
                className="aspect-[16/10] rounded-none"
              />
              <div className="space-y-3 p-5">
                {!a.published ? (
                  <p className="text-xs font-medium text-primary">
                    {t("editorial.draft")}
                  </p>
                ) : null}
                <h2 className="text-xl font-semibold group-hover:text-primary">
                  {a.title}
                </h2>
                <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {a.excerpt}
                </p>
                <span className="inline-block text-sm font-medium text-primary">
                  {t("editorial.readArticle")} →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
