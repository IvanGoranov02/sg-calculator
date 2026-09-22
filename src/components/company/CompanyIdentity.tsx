"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { companyLogoUrl } from "@/lib/companyLogo";
import { cn } from "@/lib/utils";

type CompanyIdentityProps = {
  symbol: string;
  name?: string | null;
  href?: string;
  size?: "sm" | "md";
  className?: string;
  /** When nested in a clickable row, stop propagation on link click. */
  onLinkClick?: (e: React.MouseEvent) => void;
  /** Stack ticker/name to the right of the logo (default) or center for table headers. */
  align?: "start" | "end";
  /** Which label is primary when both symbol and name are available. */
  primaryLabel?: "symbol" | "name";
};

const logoSizes = {
  sm: { box: "size-8 text-[10px]", px: 32 },
  md: { box: "size-10 text-xs", px: 40 },
} as const;

function CompanyLogo({
  symbol,
  size,
}: {
  symbol: string;
  size: "sm" | "md";
}) {
  const [failed, setFailed] = useState(false);
  const dims = logoSizes[size];
  const initials = symbol.slice(0, 2).toUpperCase();

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-muted-foreground ring-1 ring-border",
        dims.box,
      )}
      aria-hidden
    >
      {!failed ? (
        <Image
          src={companyLogoUrl(symbol)}
          alt=""
          width={dims.px}
          height={dims.px}
          className="size-full object-cover"
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{initials}</span>
      )}
    </span>
  );
}

export function CompanyIdentity({
  symbol,
  name,
  href,
  size = "md",
  className,
  onLinkClick,
  align = "start",
  primaryLabel = "symbol",
}: CompanyIdentityProps) {
  const sym = symbol.trim().toUpperCase();
  const displayName = name?.trim() || null;
  const mainLabel = primaryLabel === "name" && displayName ? displayName : sym;
  const subLabel = primaryLabel === "name" && displayName ? sym : displayName;

  const body = (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2.5",
        align === "end" && "flex-row-reverse text-right",
        className,
      )}
    >
      <CompanyLogo symbol={sym} size={size} />
      <div className={cn("min-w-0", align === "end" && "items-end")}>
        <p className="truncate font-semibold leading-tight text-foreground" title={mainLabel}>{mainLabel}</p>
        {subLabel ? (
          <p className="truncate text-xs leading-tight text-muted-foreground" title={subLabel}>
            {subLabel}
          </p>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="inline-flex min-w-0 max-w-full rounded-md hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        onClick={onLinkClick}
      >
        {body}
      </Link>
    );
  }

  return body;
}
