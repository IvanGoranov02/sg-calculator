"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import {
  useSiteCopy,
  setSiteCopy,
  imageCopyKey,
  type SiteCopy,
} from "@/lib/siteCopy";
import { messageEntries } from "@/lib/siteContentSchema";
import { emptyImage, type EditorialImage } from "@/lib/editorialContent";
import { MediaEditor } from "./MediaEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function SiteEditor() {
  const { locale, t } = useI18n();
  const bg = locale === "bg";
  const pathname = usePathname();
  const { data: session } = useSession();
  const copy = useSiteCopy();
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [query, setQuery] = useState("");
  const [key, setKey] = useState("");
  const [imageKey, setImageKey] = useState("");
  const [draftImage, setDraftImage] = useState<EditorialImage>(emptyImage);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const original = useRef<SiteCopy | null>(null);
  const imgSources = useRef(
    new WeakMap<
      HTMLImageElement,
      {
        src: string;
        alt: string;
        fit: string;
        position: string;
        srcset: string | null;
        display: string;
        appliedSrc: string;
      }
    >(),
  );
  const entries = useMemo(() => messageEntries(locale), [locale]);
  const visible = entries
    .filter(
      ([k, v]) =>
        !query ||
        `${k} ${v} ${copy[locale][k] ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .slice(0, 60);
  useEffect(() => {
    const apply = () => {
      document.querySelectorAll("img").forEach((img) => {
        if (img.closest("[data-editor-ui]")) return;
        let saved = imgSources.current.get(img);
        const currentSrc = img.getAttribute("src") ?? "";
        // React may reuse an image node for different content. Never restore an old logo over it.
        if (
          saved &&
          currentSrc !== saved.src &&
          currentSrc !== saved.appliedSrc
        ) {
          imgSources.current.delete(img);
          saved = undefined;
        }
        const source = saved?.src ?? currentSrc;
        const override = copy.images[imageCopyKey(pathname, source)];
        if (override) {
          if (!saved)
            saved = {
              src: source,
              alt: img.alt,
              fit: img.style.objectFit,
              position: img.style.objectPosition,
              srcset: img.getAttribute("srcset"),
              display: img.style.display,
              appliedSrc: override.src,
            };
          saved.appliedSrc = override.src;
          imgSources.current.set(img, saved);
          if (img.hasAttribute("srcset")) img.removeAttribute("srcset");
          if (img.getAttribute("src") !== override.src)
            img.setAttribute("src", override.src);
          img.style.display = override.src ? saved.display : "none";
          img.style.objectFit = "cover";
          img.style.objectPosition = `${override.x}% ${override.y}%`;
          img.alt = override.alt;
        } else if (saved) {
          if (img.getAttribute("src") !== saved.src)
            img.setAttribute("src", saved.src);
          if (saved.srcset) img.setAttribute("srcset", saved.srcset);
          img.style.display = saved.display;
          img.alt = saved.alt;
          img.style.objectFit = saved.fit;
          img.style.objectPosition = saved.position;
          imgSources.current.delete(img);
        }
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "srcset"],
    });
    return () => observer.disconnect();
  }, [copy.images, pathname]);
  useEffect(() => {
    if (!selecting) return;
    const onClick = (event: MouseEvent) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || el.closest("[data-editor-ui]"))
        return;
      event.preventDefault();
      event.stopPropagation();
      if (el instanceof HTMLImageElement) {
        const src =
          imgSources.current.get(el)?.src ?? el.getAttribute("src") ?? "";
        const ik = imageCopyKey(pathname, src);
        setImageKey(ik);
        setDraftImage(copy.images[ik] ?? { src, alt: el.alt, x: 50, y: 50 });
        setKey("");
      } else {
        const text = el.textContent?.trim();
        const entry = entries.find(([k, v]) => (copy[locale][k] ?? v) === text);
        if (entry) {
          setKey(entry[0]);
          setImageKey("");
          setQuery("");
        } else
          setError(
            t(
              "editorial.thisIsDynamicDataOrArticleContentChooseAnInterfaceLabelOrEditTheArticle",
            ),
          );
      }
      setSelecting(false);
      setOpen(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [selecting, entries, copy, locale, pathname, bg, t]);
  if (!session?.user?.isAdmin) return null;
  function begin() {
    original.current = copy;
    setError("");
    setOpen(true);
  }
  function cancel() {
    if (original.current) setSiteCopy(original.current);
    original.current = null;
    setOpen(false);
    setSelecting(false);
    setKey("");
    setImageKey("");
  }
  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/site-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(copy),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSiteCopy(data.copy);
      original.current = null;
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="mt-8 border-t border-border pt-4" data-editor-ui>
      {!open ? (
        <Button variant="outline" onClick={begin}>
          {t("editorial.editPage")}
        </Button>
      ) : (
        <section
          aria-label={t("editorial.pageEditor")}
          className="fixed bottom-20 right-3 z-50 flex max-h-[75vh] w-[min(35rem,calc(100vw-1.5rem))] flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl lg:bottom-5"
        >
          <h2 className="text-lg font-semibold">
            {t("editorial.editPage")} · {locale.toUpperCase()}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t(
              "editorial.selectALabelOrImageOnThePageChangesArePublishedWithSave",
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSelecting(!selecting);
                setError("");
              }}
            >
              {selecting
                ? t("editorial.selectAnElement")
                : t("editorial.selectOnPage")}
            </Button>
            <Button variant="ghost" disabled={saving} onClick={cancel}>
              {t("editorial.cancel")}
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "…" : t("editorial.save")}
            </Button>
          </div>
          {imageKey ? (
            <MediaEditor
              image={draftImage}
              onChange={(image) => {
                setDraftImage(image);
                setSiteCopy({
                  ...copy,
                  images: { ...copy.images, [imageKey]: image },
                });
              }}
            />
          ) : (
            <>
              <Input
                aria-label={t("editorial.findText")}
                placeholder={t("editorial.findTextOrKey")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {key ? (
                <label className="space-y-1 text-sm">
                  <span className="text-xs text-muted-foreground">{key}</span>
                  <textarea
                    className="min-h-24 w-full rounded-lg border border-input bg-background p-3"
                    value={
                      copy[locale][key] ??
                      entries.find(([k]) => k === key)?.[1] ??
                      ""
                    }
                    onChange={(e) =>
                      setSiteCopy({
                        ...copy,
                        [locale]: { ...copy[locale], [key]: e.target.value },
                      })
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const next = { ...copy[locale] };
                      delete next[key];
                      setSiteCopy({ ...copy, [locale]: next });
                    }}
                  >
                    {t("editorial.restoreOriginal")}
                  </Button>
                </label>
              ) : null}
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                {visible.map(([k, v]) => (
                  <button
                    type="button"
                    key={k}
                    onClick={() => setKey(k)}
                    className="block w-full border-b border-border px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="block text-xs text-muted-foreground">
                      {k}
                    </span>
                    {(copy[locale][k] ?? v).slice(0, 150)}
                  </button>
                ))}
              </div>
            </>
          )}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
