"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import {
  emptyImage,
  safeMediaUrl,
  type EditorialImage,
} from "@/lib/editorialContent";
export function EditorialPhoto({
  image,
  className = "aspect-video",
}: {
  image: EditorialImage;
  className?: string;
}) {
  return image.src ? (
    <div className={`overflow-hidden rounded-xl bg-muted ${className}`}>
      <Image
        unoptimized
        width={1600}
        height={1000}
        src={image.src}
        alt={image.alt}
        className="h-full w-full object-cover"
        style={{ objectPosition: `${image.x}% ${image.y}%` }}
      />
    </div>
  ) : null;
}
export function MediaEditor({
  image,
  onChange,
}: {
  image: EditorialImage;
  onChange: (image: EditorialImage) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState("");
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  );
  async function upload(file?: File) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
        file.type,
      ) ||
      file.size > 2_000_000
    ) {
      setError(t("editorial.chooseAPNGJPEGWebPOrGIFUpTo2MB"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setError("");
      onChange({ ...image, src: String(reader.result) });
    };
    reader.onerror = () => setError(t("editorial.couldNotReadTheFile"));
    reader.readAsDataURL(file);
  }
  return (
    <fieldset className="space-y-3 rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-medium">
        {t("editorial.imageAndFraming")}
      </legend>
      <label className="block text-sm">
        {t("editorial.hTTPSURL")}
        <Input
          key={image.src}
          defaultValue={image.src.startsWith("data:") ? "" : image.src}
          placeholder="https://…"
          onBlur={(e) => {
            const src = e.target.value;
            if (safeMediaUrl(src)) {
              setError("");
              onChange({ ...image, src });
            } else setError(t("editorial.invalidHTTPSURL"));
          }}
        />
      </label>
      <label className="block text-sm">
        {t("editorial.uploadAnImageUpTo2MB")}
        <input
          className="mt-1 block w-full text-sm"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </label>
      <label className="block text-sm">
        {t("editorial.alternativeText")}
        <Input
          value={image.alt}
          onChange={(e) => onChange({ ...image, alt: e.target.value })}
        />
      </label>
      {image.src ? (
        <>
          <div
            className="cursor-move touch-none select-none"
            onPointerDown={(e) => {
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                px: image.x,
                py: image.y,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const r = e.currentTarget.getBoundingClientRect();
              onChange({
                ...image,
                x: Math.max(
                  0,
                  Math.min(
                    100,
                    drag.current.px -
                      ((e.clientX - drag.current.x) / r.width) * 100,
                  ),
                ),
                y: Math.max(
                  0,
                  Math.min(
                    100,
                    drag.current.py -
                      ((e.clientY - drag.current.y) / r.height) * 100,
                  ),
                ),
              });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <EditorialPhoto image={image} />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("editorial.dragTheImageOrUseTheSliders")}
          </p>
          {(["x", "y"] as const).map((axis) => (
            <label key={axis} className="flex items-center gap-3 text-sm">
              {axis === "x"
                ? t("editorial.horizontal")
                : t("editorial.vertical")}
              <input
                className="flex-1"
                type="range"
                min="0"
                max="100"
                value={image[axis]}
                onChange={(e) =>
                  onChange({ ...image, [axis]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange({ ...emptyImage })}
          >
            {t("editorial.removeImage")}
          </Button>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
