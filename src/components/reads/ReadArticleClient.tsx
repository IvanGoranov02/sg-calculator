"use client";

import { ArrowLeft, Clock, Pencil } from "lucide-react";
import Link from "next/link";

import type { ReadPost } from "@/lib/reads";

import { ReadBlocks } from "./ReadBlocks";
import { useReadsText } from "./readsText";

export function ReadArticleClient({ post, isAdmin }: { post: ReadPost; isAdmin: boolean }) {
  const { s, locale } = useReadsText();
  const date = new Date(post.publishedAt ?? post.createdAt).toLocaleDateString(locale === "bg" ? "bg-BG" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <article className="mx-auto w-full max-w-3xl pb-16">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href="/reads" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {s.back}
        </Link>
        {isAdmin ? (
          <Link
            href={`/reads/${post.slug}/edit`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-card transition hover:bg-primary/90"
          >
            <Pencil className="size-4" aria-hidden /> {s.edit}
          </Link>
        ) : null}
      </div>

      <header className="mb-8">
        <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{date}</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-4" aria-hidden /> {post.minutes} {s.minRead}
          </span>
          {post.status === "draft" ? (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">{s.draft}</span>
          ) : null}
        </p>
        <h1 className="text-balance text-3xl font-semibold leading-[1.12] tracking-tight sm:text-5xl">{post.title}</h1>
        {post.excerpt ? <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{post.excerpt}</p> : null}
      </header>

      {post.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.cover} alt="" className="mb-12 aspect-[16/9] w-full rounded-2xl border border-border object-cover shadow-card" />
      ) : null}

      <ReadBlocks blocks={post.blocks} />
    </article>
  );
}
