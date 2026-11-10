"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { SiteContentSnapshot, SiteImageOverride } from "@/lib/siteContent";

import {
  applyImages,
  applyTexts,
  imageTransform,
  originalImageKey,
  originalTextOf,
} from "./siteContentDom";

type ImageDialog = {
  type: "image";
  key: string;
  currentSrc: string;
  w: number;
  h: number;
  round: boolean;
  draft: SiteImageOverride;
};

type Dialog = { type: "text"; orig: string; draft: string } | ImageDialog;

const L = {
  bg: {
    edit: "Редактирай страницата",
    done: "Готово",
    hint: "Режим на редактиране: натисни текст или снимка",
    save: "Запази",
    cancel: "Отказ",
    restore: "Върни оригинала",
    text: "Редакция на текст",
    textNote: "Променя се навсякъде, където се появява точно този текст.",
    image: "Редакция на снимка",
    drag: "Дръпни снимката, за да я наместиш. Мащаб:",
    upload: "Качи снимка",
    url: "или постави линк (https://…)",
    apply: "Приложи",
    error: "Неуспешно запазване.",
  },
  en: {
    edit: "Edit page",
    done: "Done",
    hint: "Edit mode: click any text or image",
    save: "Save",
    cancel: "Cancel",
    restore: "Restore original",
    text: "Edit text",
    textNote: "Changes every place that shows exactly this text.",
    image: "Edit image",
    drag: "Drag the image to position it. Zoom:",
    upload: "Upload image",
    url: "or paste a link (https://…)",
    apply: "Apply",
    error: "Could not save.",
  },
} as const;

type Strings = (typeof L)["bg"] | (typeof L)["en"];

function toMaps(s: SiteContentSnapshot) {
  return {
    texts: new Map(Object.entries(s.texts)),
    images: new Map(Object.entries(s.images)),
  };
}

function textAtPoint(x: number, y: number, target: EventTarget | null): Text | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null;
  };
  let node: Node | null = null;
  if (doc.caretRangeFromPoint) node = doc.caretRangeFromPoint(x, y)?.startContainer ?? null;
  else if (doc.caretPositionFromPoint) node = doc.caretPositionFromPoint(x, y)?.offsetNode ?? null;
  if (node && node.nodeType === Node.TEXT_NODE && (node.nodeValue ?? "").trim()) {
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of Array.from(range.getClientRects())) {
      if (x >= r.left - 3 && x <= r.right + 3 && y >= r.top - 3 && y <= r.bottom + 3) return node as Text;
    }
  }
  if (target instanceof Element) {
    const texts = Array.from(target.childNodes).filter(
      (n): n is Text => n.nodeType === Node.TEXT_NODE && !!(n.nodeValue ?? "").trim(),
    );
    if (texts.length === 1) return texts[0];
  }
  return null;
}

async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 1000;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const q of [0.88, 0.7, 0.5]) {
    const out = canvas.toDataURL("image/webp", q);
    if (out.length < 1_500_000) return out;
  }
  throw new Error("too large");
}

export function SiteContentRuntime() {
  const { data: session } = useSession();
  const isAdmin = !!session?.user?.isAdmin;
  const { locale } = useI18n();
  const s: Strings = locale === "bg" ? L.bg : L.en;

  const [snapshot, setSnapshot] = useState<SiteContentSnapshot>({ texts: {}, images: {} });
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const maps = useMemo(() => toMaps(snapshot), [snapshot]);
  const mapsRef = useRef(maps);
  useEffect(() => {
    mapsRef.current = maps;
  }, [maps]);

  useEffect(() => {
    let live = true;
    fetch("/api/site-content", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SiteContentSnapshot | null) => {
        if (live && d && d.texts && d.images) setSnapshot(d);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // Keep overrides applied while the app re-renders.
  useEffect(() => {
    let raf = 0;
    const run = () => {
      raf = 0;
      applyTexts(mapsRef.current.texts);
      applyImages(mapsRef.current.images);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(run);
    };
    schedule();
    const obs = new MutationObserver(schedule);
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["src", "srcset"],
    });
    return () => {
      obs.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [maps]);

  useEffect(() => {
    document.documentElement.classList.toggle("sg-edit-mode", editing && isAdmin);
    return () => document.documentElement.classList.remove("sg-edit-mode");
  }, [editing, isAdmin]);

  // Edit mode: intercept clicks so links/buttons do not fire.
  useEffect(() => {
    if (!editing || !isAdmin) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || target.closest("[data-site-editor-ui]")) return;
      e.preventDefault();
      e.stopPropagation();
      const textNode = textAtPoint(e.clientX, e.clientY, target);
      if (textNode) {
        const orig = originalTextOf(textNode);
        const shown = mapsRef.current.texts.get(orig) ?? orig;
        setError(null);
        setDialog({ type: "text", orig, draft: shown });
        return;
      }
      const img = document
        .elementsFromPoint(e.clientX, e.clientY)
        .find((el): el is HTMLImageElement => el instanceof HTMLImageElement && !el.closest("[data-site-editor-ui]"));
      if (img) {
        const key = originalImageKey(img);
        if (!key) return;
        const rect = img.getBoundingClientRect();
        const radius = parseFloat(getComputedStyle(img.parentElement ?? img).borderRadius || "0");
        const existing = mapsRef.current.images.get(key);
        setError(null);
        setUrlDraft("");
        setDialog({
          type: "image",
          key,
          currentSrc: existing?.src ?? (img.currentSrc || img.src),
          w: rect.width || 64,
          h: rect.height || 64,
          round: radius >= Math.min(rect.width, rect.height) / 2 - 1,
          draft: existing ?? { x: 0, y: 0, zoom: 1 },
        });
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [editing, isAdmin]);

  const save = useCallback(
    async (kind: "text" | "image", key: string, value: string | SiteImageOverride | null) => {
      setError(null);
      try {
        const res = await fetch("/api/site-content", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, key, value }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
          throw new Error(`${res.status} ${body.detail ?? body.error ?? ""}`.trim());
        }
        setSnapshot((prev) => {
          const next: SiteContentSnapshot = { texts: { ...prev.texts }, images: { ...prev.images } };
          if (kind === "text") {
            if (value === null) delete next.texts[key];
            else next.texts[key] = value as string;
          } else if (value === null) delete next.images[key];
          else next.images[key] = value as SiteImageOverride;
          return next;
        });
        setDialog(null);
      } catch (e) {
        setError(`${s.error} ${e instanceof Error ? e.message : ""}`.trim());
      }
    },
    [s.error],
  );


  if (!isAdmin) return <div hidden data-site-runtime />;

  const btn =
    "rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted";

  return (
    <div data-site-editor-ui>
      <style>{`html.sg-edit-mode body *:hover{outline:1px dashed rgba(59,130,246,.8);outline-offset:1px;cursor:text}
html.sg-edit-mode img:hover{cursor:pointer}
html.sg-edit-mode [data-site-editor-ui] *:hover{outline:none}`}</style>
      <div className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2">
        {editing ? (
          <span className="rounded-md bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow ring-1 ring-border">
            {s.hint}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setEditing((v) => !v);
            setDialog(null);
          }}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg"
        >
          {editing ? s.done : s.edit}
        </button>
      </div>

      {dialog ? (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-4 shadow-2xl">
            {dialog.type === "text" ? (
              <>
                <h2 className="mb-1 text-base font-semibold">{s.text}</h2>
                <p className="mb-2 text-xs text-muted-foreground">{s.textNote}</p>
                <textarea
                  autoFocus
                  value={dialog.draft}
                  onChange={(e) => setDialog({ ...dialog, draft: e.target.value })}
                  rows={4}
                  className="w-full rounded-md border border-input bg-background p-2 text-sm"
                />
                {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {snapshot.texts[dialog.orig] !== undefined ? (
                    <button type="button" className={btn} onClick={() => void save("text", dialog.orig, null)}>
                      {s.restore}
                    </button>
                  ) : null}
                  <button type="button" className={btn} onClick={() => setDialog(null)}>
                    {s.cancel}
                  </button>
                  <button
                    type="button"
                    className={`${btn} bg-primary text-primary-foreground`}
                    disabled={!dialog.draft.trim()}
                    onClick={() =>
                      void save("text", dialog.orig, dialog.draft.trim() === dialog.orig ? null : dialog.draft.trim())
                    }
                  >
                    {s.save}
                  </button>
                </div>
              </>
            ) : (
              <ImageEditor
                dialog={dialog}
                s={s}
                btn={btn}
                error={error}
                urlDraft={urlDraft}
                setUrlDraft={setUrlDraft}
                setDialog={setDialog}
                onSave={(v) => void save("image", dialog.key, v)}
                onError={setError}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ImageEditor(props: {
  dialog: ImageDialog;
  s: Strings;
  btn: string;
  error: string | null;
  urlDraft: string;
  setUrlDraft: (v: string) => void;
  setDialog: (d: Dialog | null) => void;
  onSave: (v: SiteImageOverride | null) => void;
  onError: (m: string | null) => void;
}) {
  const { dialog, s, btn } = props;
  const drag = useRef<{ x: number; y: number } | null>(null);
  const { draft } = dialog;
  const scale = Math.min(1, 320 / dialog.w, 240 / dialog.h);
  const boxW = Math.max(48, dialog.w * scale);
  const boxH = Math.max(48, dialog.h * scale);
  const src = draft.src ?? dialog.currentSrc;

  const set = (patch: Partial<SiteImageOverride>) => {
    const next = { ...draft, ...patch };
    const lim = (next.zoom - 1) * 50;
    props.setDialog({
      ...dialog,
      draft: {
        ...next,
        x: Math.max(-lim, Math.min(lim, next.x)),
        y: Math.max(-lim, Math.min(lim, next.y)),
      },
    });
  };

  return (
    <>
      <h2 className="mb-2 text-base font-semibold">{s.image}</h2>
      <div className="flex justify-center">
        <div
          className={`relative touch-none select-none overflow-hidden bg-muted ring-1 ring-border ${dialog.round ? "rounded-full" : "rounded-md"}`}
          style={{ width: boxW, height: boxH, cursor: "grab" }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const dx = ((e.clientX - drag.current.x) / boxW) * 100;
            const dy = ((e.clientY - drag.current.y) / boxH) * 100;
            drag.current = { x: e.clientX, y: e.clientY };
            set({ x: draft.x + dx, y: draft.y + dy });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            draggable={false}
            className="pointer-events-none h-full w-full object-cover"
            style={{ transform: imageTransform(draft), transformOrigin: "center" }}
          />
        </div>
      </div>
      <label className="mt-3 block text-xs text-muted-foreground">
        {s.drag} {draft.zoom.toFixed(2)}×
        <input
          type="range"
          min={1}
          max={5}
          step={0.05}
          value={draft.zoom}
          onChange={(e) => set({ zoom: Number(e.target.value) })}
          className="mt-1 w-full"
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className={`${btn} cursor-pointer`}>
          {s.upload}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const data = await shrinkImage(f);
                props.onError(null);
                props.setDialog({ ...dialog, draft: { src: data, x: 0, y: 0, zoom: 1 } });
              } catch {
                props.onError(s.error);
              }
            }}
          />
        </label>
        <input
          value={props.urlDraft}
          onChange={(e) => props.setUrlDraft(e.target.value)}
          placeholder={s.url}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          className={btn}
          disabled={!/^https:\/\//i.test(props.urlDraft.trim())}
          onClick={() => props.setDialog({ ...dialog, draft: { src: props.urlDraft.trim(), x: 0, y: 0, zoom: 1 } })}
        >
          {s.apply}
        </button>
      </div>
      {props.error ? <p className="mt-2 text-sm text-red-500">{props.error}</p> : null}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" className={btn} onClick={() => props.onSave(null)}>
          {s.restore}
        </button>
        <button type="button" className={btn} onClick={() => props.setDialog(null)}>
          {s.cancel}
        </button>
        <button type="button" className={`${btn} bg-primary text-primary-foreground`} onClick={() => props.onSave(draft)}>
          {s.save}
        </button>
      </div>
    </>
  );
}
