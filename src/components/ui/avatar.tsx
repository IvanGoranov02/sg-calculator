"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";

type AvatarProps = {
  src?: string | null;
  alt?: string;
  fallback?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
};

const sizeClasses = {
  sm: "size-7 text-[10px]",
  md: "size-9 text-xs",
  lg: "size-12 text-sm",
} as const;

const imageSizes = {
  sm: 28,
  md: 36,
  lg: 48,
} as const;

export function Avatar({ src, alt = "", fallback, className, size = "md" }: AvatarProps) {
  const initials =
    fallback ??
    alt
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-medium text-muted-foreground ring-1 ring-border",
        sizeClasses[size],
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={imageSizes[size]}
          height={imageSizes[size]}
          className="size-full object-cover"
          unoptimized
        />
      ) : (
        <span aria-hidden>{initials || "?"}</span>
      )}
    </span>
  );
}
