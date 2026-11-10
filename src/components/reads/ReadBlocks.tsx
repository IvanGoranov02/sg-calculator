import type { ReactNode } from "react";

import type { ReadBlock } from "@/lib/reads";

/** Tiny inline formatter: **bold**, *italic*, [text](https://link). Everything else is plain text. */
export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g;
  let last = 0;
  let i = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={i++} className="font-semibold text-foreground">{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<em key={i++}>{m[2]}</em>);
    else
      out.push(
        <a
          key={i++}
          href={m[4]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
        >
          {m[3]}
        </a>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function videoEmbed(url: string): { kind: "iframe"; src: string } | { kind: "file"; src: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v") ?? (u.pathname.startsWith("/embed/") ? u.pathname.split("/")[2] : null);
      if (id) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` };
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` };
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return { kind: "iframe", src: `https://player.vimeo.com/video/${id}` };
    }
    if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) return { kind: "file", src: url };
  } catch {
    /* not a URL */
  }
  return null;
}

export function ReadBlocks({ blocks }: { blocks: ReadBlock[] }) {
  return (
    <div className="read-body">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return b.sub ? (
              <h3 key={i} className="mb-3 mt-9 text-balance text-xl font-semibold tracking-tight">
                {b.text}
              </h3>
            ) : (
              <h2 key={i} className="mb-4 mt-14 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                {b.text}
              </h2>
            );
          case "list": {
            const Tag = b.ordered ? "ol" : "ul";
            return (
              <Tag
                key={i}
                className={`mb-6 space-y-2.5 pl-6 text-[1.05rem] leading-[1.75] text-foreground/85 marker:text-primary ${b.ordered ? "list-decimal" : "list-disc"}`}
              >
                {b.items.map((it, j) => (
                  <li key={j} className="pl-1">
                    {renderInline(it)}
                  </li>
                ))}
              </Tag>
            );
          }
          case "table": {
            const [head, ...body] = b.rows;
            if (!head) return null;
            return (
              <div key={i} className="my-8 overflow-x-auto rounded-xl border border-border shadow-card">
                <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
                  <thead className="bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      {head.map((c, j) => (
                        <th key={j} className="px-4 py-3 font-semibold">
                          {renderInline(c)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {body.map((r, ri) => (
                      <tr key={ri} className="border-t border-border">
                        {r.map((c, j) => (
                          <td key={j} className={`px-4 py-3 ${j === 0 ? "font-medium text-foreground" : "text-foreground/85"}`}>
                            {renderInline(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          case "paragraph":
            return b.text
              .split(/\n{2,}/)
              .filter((p) => p.trim())
              .map((p, j) => (
                <p key={`${i}-${j}`} className="mb-6 text-[1.05rem] leading-[1.85] text-foreground/85">
                  {renderInline(p.trim())}
                </p>
              ));
          case "quote":
            return (
              <blockquote
                key={i}
                className="my-10 rounded-r-xl border-l-4 border-primary bg-primary/8 px-6 py-5 text-xl font-medium leading-relaxed text-foreground"
              >
                {renderInline(b.text)}
              </blockquote>
            );
          case "image":
            return (
              <figure key={i} className="my-10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.src}
                  alt={b.caption ?? ""}
                  loading="lazy"
                  className="w-full rounded-2xl border border-border shadow-card"
                />
                {b.caption ? (
                  <figcaption className="mt-3 text-center text-sm text-muted-foreground">{b.caption}</figcaption>
                ) : null}
              </figure>
            );
          case "video": {
            const v = videoEmbed(b.url);
            return (
              <figure key={i} className="my-10">
                <div className="aspect-video overflow-hidden rounded-2xl border border-border bg-black shadow-card">
                  {v?.kind === "iframe" ? (
                    <iframe
                      src={v.src}
                      title={b.caption ?? "Video"}
                      className="size-full"
                      loading="lazy"
                      allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
                      allowFullScreen
                    />
                  ) : v?.kind === "file" ? (
                    <video src={v.src} controls preload="metadata" className="size-full" />
                  ) : (
                    <a href={b.url} target="_blank" rel="noopener noreferrer" className="flex size-full items-center justify-center text-sm text-primary underline">
                      {b.url}
                    </a>
                  )}
                </div>
                {b.caption ? (
                  <figcaption className="mt-3 text-center text-sm text-muted-foreground">{b.caption}</figcaption>
                ) : null}
              </figure>
            );
          }
          case "divider":
            return <hr key={i} className="my-12 border-border" />;
        }
      })}
    </div>
  );
}
