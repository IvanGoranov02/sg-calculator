"use client";

import { ArrowRight, Clock, Plus } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { ReadSummary } from "@/lib/reads";

import { useReadsText } from "./readsText";

function Cover({ post, className }: { post: ReadSummary; className?: string }) {
  return post.cover ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={post.cover} alt="" loading="lazy" className={cn("size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]", className)} />
  ) : (
    <div className="size-full bg-gradient-to-br from-primary/35 via-chart-3/25 to-chart-2/30" />
  );
}

function Meta({ post }: { post: ReadSummary }) {
  const { s, locale } = useReadsText();
  const date = new Date(post.publishedAt ?? post.createdAt).toLocaleDateString(locale === "bg" ? "bg-BG" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>{date}</span>
      <span className="inline-flex items-center gap-1">
        <Clock className="size-3.5" aria-hidden /> {post.minutes} {s.minRead}
      </span>
      {post.status === "draft" ? (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-400">{s.draft}</span>
      ) : null}
    </p>
  );
}

export function ReadsIndexClient({ posts, isAdmin }: { posts: ReadSummary[]; isAdmin: boolean }) {
  const { s } = useReadsText();
  const [first, ...rest] = posts;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{s.title}</h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{s.subtitle}</p>
        </div>
        {isAdmin ? (
          <Link
            href="/reads/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-card transition hover:bg-primary/90"
          >
            <Plus className="size-4" aria-hidden /> {s.newRead}
          </Link>
        ) : null}
      </div>

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 px-6 py-16 text-center text-sm text-muted-foreground">
          {isAdmin ? s.emptyAdmin : s.empty}
        </div>
      ) : (
        <>
          <Link
            href={`/reads/${first.slug}`}
            className="group grid overflow-hidden rounded-2xl border border-border bg-card shadow-card transition hover:border-primary/50 xl:grid-cols-[1.4fr_1fr]"
          >
            <div className="aspect-[16/10] overflow-hidden xl:aspect-auto xl:min-h-[18rem]">
              <Cover post={first} />
            </div>
            <div className="flex flex-col justify-center gap-3 p-6 sm:p-8">
              <Meta post={first} />
              <h2 className="text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{first.title}</h2>
              {first.excerpt ? <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">{first.excerpt}</p> : null}
              <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                {s.readMore} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </span>
            </div>
          </Link>

          {rest.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((p) => (
                <Link
                  key={p.id}
                  href={`/reads/${p.slug}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition hover:-translate-y-0.5 hover:border-primary/50"
                >
                  <div className="aspect-[16/10] overflow-hidden">
                    <Cover post={p} />
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <Meta post={p} />
                    <h3 className="text-balance text-lg font-semibold leading-snug tracking-tight">{p.title}</h3>
                    {p.excerpt ? <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{p.excerpt}</p> : null}
                  </div>
                </Link>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
