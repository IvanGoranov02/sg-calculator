"use client";

import { ArrowDown, ArrowLeft, ArrowUp, ImagePlus, Minus, Quote, Trash2, Type, Video, Heading2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ReadBlock, ReadPost } from "@/lib/reads";

import { useReadsText } from "./readsText";

async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 1800;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const q of [0.86, 0.72, 0.55]) {
    const out = canvas.toDataURL("image/webp", q);
    // base64 length ~ 4/3 of bytes; server limit is 3 MB of bytes.
    if (out.length < 3_800_000) return out;
  }
  throw new Error("too large");
}

async function uploadImage(file: File): Promise<string> {
  const data = await shrinkImage(file);
  const res = await fetch("/api/reads/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; detail?: string };
  if (!res.ok || !body.url) throw new Error(body.detail ?? String(res.status));
  return body.url;
}

const field =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25";
const smallBtn =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition hover:bg-muted disabled:opacity-40";

function ImagePicker(props: {
  value: string | null;
  onChange: (url: string | null) => void;
  onError: (m: string) => void;
  uploadLabel: string;
  changeLabel: string;
  removeLabel: string;
  urlPh: string;
  applyLabel: string;
  failedLabel: string;
  tall?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  return (
    <div className="space-y-2">
      {props.value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={props.value}
          alt=""
          className={`w-full rounded-xl border border-border object-cover ${props.tall ? "aspect-[16/9]" : "max-h-72"}`}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${smallBtn} cursor-pointer`}>
          <ImagePlus className="size-3.5" aria-hidden /> {busy ? "…" : props.value ? props.changeLabel : props.uploadLabel}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setBusy(true);
              try {
                props.onChange(await uploadImage(f));
              } catch (err) {
                props.onError(`${props.failedLabel} ${err instanceof Error ? err.message : ""}`.trim());
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        {props.value ? (
          <button type="button" className={smallBtn} onClick={() => props.onChange(null)}>
            <Trash2 className="size-3.5" aria-hidden /> {props.removeLabel}
          </button>
        ) : null}
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={props.urlPh}
          className={`${field} !w-auto min-w-0 flex-1 !py-1.5 text-xs`}
        />
        <button
          type="button"
          className={smallBtn}
          disabled={!/^https:\/\//i.test(url.trim())}
          onClick={() => {
            props.onChange(url.trim());
            setUrl("");
          }}
        >
          {props.applyLabel}
        </button>
      </div>
    </div>
  );
}

export function ReadEditor({ post }: { post: ReadPost | null }) {
  const { s } = useReadsText();
  const router = useRouter();
  const [title, setTitle] = useState(post?.title ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [cover, setCover] = useState<string | null>(post?.cover ?? null);
  const [blocks, setBlocks] = useState<ReadBlock[]>(post?.blocks ?? [{ type: "paragraph", text: "" }]);
  const [published] = useState(post ? post.status === "published" : false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<ReadBlock>) =>
    setBlocks((bs) => bs.map((b, j) => (j === i ? ({ ...b, ...patch } as ReadBlock) : b)));
  const move = (i: number, d: -1 | 1) =>
    setBlocks((bs) => {
      const j = i + d;
      if (j < 0 || j >= bs.length) return bs;
      const next = bs.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const insert = (b: ReadBlock, at?: number) =>
    setBlocks((bs) => {
      const next = bs.slice();
      next.splice(at === undefined ? next.length : at + 1, 0, b);
      return next;
    });

  const adders: Array<{ label: string; icon: typeof Type; make: () => ReadBlock }> = [
    { label: s.addParagraph, icon: Type, make: () => ({ type: "paragraph", text: "" }) },
    { label: s.addHeading, icon: Heading2, make: () => ({ type: "heading", text: "" }) },
    { label: s.addImage, icon: ImagePlus, make: () => ({ type: "image", src: "", caption: "" }) },
    { label: s.addVideo, icon: Video, make: () => ({ type: "video", url: "", caption: "" }) },
    { label: s.addQuote, icon: Quote, make: () => ({ type: "quote", text: "" }) },
    { label: s.addDivider, icon: Minus, make: () => ({ type: "divider" }) },
  ];

  async function save(publish: boolean | null) {
    if (!title.trim()) {
      setError(s.needTitle);
      return;
    }
    setSaving(true);
    setError(null);
    const status = publish === null ? (published ? "published" : "draft") : publish ? "published" : "draft";
    // Drop empty blocks so half-filled editors do not break validation.
    const clean = blocks.filter((b) => {
      if (b.type === "image") return !!b.src;
      if (b.type === "video") return !!b.url;
      if (b.type === "divider") return true;
      return b.text.trim().length > 0;
    });
    try {
      const res = await fetch(post ? `/api/reads/${post.id}` : "/api/reads", {
        method: post ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, excerpt, cover, blocks: clean, status }),
      });
      const body = (await res.json().catch(() => ({}))) as { slug?: string; detail?: string; error?: string };
      if (!res.ok || !body.slug) throw new Error(`${res.status} ${body.detail ?? body.error ?? ""}`.trim());
      router.push(`/reads/${body.slug}`);
      router.refresh();
    } catch (e) {
      setError(`${s.saveFailed} ${e instanceof Error ? e.message : ""}`.trim());
      setSaving(false);
    }
  }

  async function remove() {
    if (!post || !window.confirm(s.confirmDelete)) return;
    setSaving(true);
    const res = await fetch(`/api/reads/${post.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/reads");
      router.refresh();
    } else {
      setError(s.saveFailed);
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl pb-24">
      <Link
        href={post ? `/reads/${post.slug}` : "/reads"}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> {post ? post.title : s.back}
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight sm:text-3xl">{post ? s.editorEdit : s.editorNew}</h1>

      <div className="space-y-6 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{s.titleLabel}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={s.titlePh}
            className={`${field} text-lg font-semibold`}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{s.excerptLabel}</span>
          <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder={s.excerptPh} rows={2} className={field} />
        </label>
        <div className="space-y-1.5">
          <span className="text-sm font-medium">{s.coverLabel}</span>
          <ImagePicker
            tall
            value={cover}
            onChange={setCover}
            onError={setError}
            uploadLabel={s.uploadCover}
            changeLabel={s.changeImage}
            removeLabel={s.removeImage}
            urlPh={s.pasteUrl}
            applyLabel={s.apply}
            failedLabel={s.uploadFailed}
          />
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{s.content}</h2>
      <div className="space-y-3">
        {blocks.map((b, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-3 shadow-card">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {{ paragraph: s.addParagraph, heading: s.addHeading, image: s.addImage, video: s.addVideo, quote: s.addQuote, divider: s.addDivider }[b.type]}
              </span>
              <div className="flex items-center gap-1">
                <button type="button" className={smallBtn} title={s.moveUp} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-3.5" aria-hidden />
                </button>
                <button type="button" className={smallBtn} title={s.moveDown} disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  className={`${smallBtn} text-red-400`}
                  title={s.remove}
                  onClick={() => setBlocks((bs) => bs.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            </div>

            {b.type === "paragraph" ? (
              <textarea
                value={b.text}
                onChange={(e) => update(i, { text: e.target.value })}
                placeholder={s.paragraphPh}
                rows={Math.min(18, Math.max(5, Math.ceil(b.text.length / 90) + 2))}
                className={`${field} leading-relaxed`}
              />
            ) : null}
            {b.type === "heading" ? (
              <input value={b.text} onChange={(e) => update(i, { text: e.target.value })} placeholder={s.headingPh} className={`${field} text-base font-semibold`} />
            ) : null}
            {b.type === "quote" ? (
              <textarea value={b.text} onChange={(e) => update(i, { text: e.target.value })} placeholder={s.quotePh} rows={3} className={field} />
            ) : null}
            {b.type === "image" ? (
              <div className="space-y-2">
                <ImagePicker
                  value={b.src || null}
                  onChange={(u) => update(i, { src: u ?? "" })}
                  onError={setError}
                  uploadLabel={s.uploadImage}
                  changeLabel={s.changeImage}
                  removeLabel={s.removeImage}
                  urlPh={s.pasteUrl}
                  applyLabel={s.apply}
                  failedLabel={s.uploadFailed}
                />
                <input value={b.caption ?? ""} onChange={(e) => update(i, { caption: e.target.value })} placeholder={s.captionPh} className={field} />
              </div>
            ) : null}
            {b.type === "video" ? (
              <div className="space-y-2">
                <input value={b.url} onChange={(e) => update(i, { url: e.target.value })} placeholder={s.videoPh} className={field} />
                <input value={b.caption ?? ""} onChange={(e) => update(i, { caption: e.target.value })} placeholder={s.captionPh} className={field} />
              </div>
            ) : null}
            {b.type === "divider" ? <hr className="border-border" /> : null}

            <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
              <span className="mr-1 text-[11px] text-muted-foreground">{s.insertBelow}:</span>
              {adders.map(({ label, icon: Icon, make }) => (
                <button key={label} type="button" className={smallBtn} onClick={() => insert(make(), i)}>
                  <Icon className="size-3.5" aria-hidden /> {label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {blocks.length === 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {adders.map(({ label, icon: Icon, make }) => (
              <button key={label} type="button" className={smallBtn} onClick={() => insert(make())}>
                <Icon className="size-3.5" aria-hidden /> {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 backdrop-blur lg:left-[10rem]">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            {post ? (
              <button type="button" className={`${smallBtn} text-red-400`} onClick={remove} disabled={saving}>
                <Trash2 className="size-3.5" aria-hidden /> {s.delete}
              </button>
            ) : null}
            {error ? <span className="max-w-xs text-xs text-red-400">{error}</span> : null}
          </div>
          <div className="flex items-center gap-2">
            {post && published ? (
              <button type="button" className={smallBtn} disabled={saving} onClick={() => void save(false)}>
                {s.saveDraft}
              </button>
            ) : null}
            {!post || !published ? (
              <button type="button" className={smallBtn} disabled={saving} onClick={() => void save(false)}>
                {s.saveDraft}
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving}
              onClick={() => void save(post && published ? null : true)}
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-card transition hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? s.saving : post && published ? s.saveChanges : s.publish}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
