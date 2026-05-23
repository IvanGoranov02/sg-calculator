"use client";

import Link from "next/link";
import { Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

type CacheItem = {
  symbol: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
};

export function CacheListClient() {
  const { t } = useI18n();
  const [items, setItems] = useState<CacheItem[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busySymbol, setBusySymbol] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cache", { cache: "no-store" });
      const data = (await res.json()) as { items?: CacheItem[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? t("admin.errLoad"));
        setItems([]);
        return;
      }
      setItems(data.items ?? []);
    } catch {
      setError(t("admin.errLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = items.filter((it) => {
    const q = filter.trim().toUpperCase();
    if (!q) return true;
    return it.symbol.includes(q) || (it.name?.toUpperCase().includes(q) ?? false);
  });

  const handleDelete = async (symbol: string) => {
    if (!window.confirm(t("admin.confirmDelete", { symbol }))) return;
    setBusySymbol(symbol);
    try {
      const res = await fetch(`/api/admin/cache/${encodeURIComponent(symbol)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? t("admin.errDelete"));
        return;
      }
      setItems((prev) => prev.filter((i) => i.symbol !== symbol));
    } finally {
      setBusySymbol(null);
    }
  };

  const handleRefresh = async (symbol: string) => {
    if (!window.confirm(t("admin.confirmRefresh", { symbol }))) return;
    setBusySymbol(symbol);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cache/${encodeURIComponent(symbol)}/refresh`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? t("admin.errRefresh"));
        return;
      }
      await load();
    } finally {
      setBusySymbol(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("admin.cacheTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("admin.cacheSubtitle")}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-white/15"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={cn("mr-2 size-4", loading && "animate-spin")} />
          {t("admin.reloadList")}
        </Button>
      </div>

      <Input
        className="max-w-xs border-white/10 bg-zinc-900/80"
        placeholder={t("admin.filterPlaceholder")}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("admin.loading")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead>{t("admin.colSymbol")}</TableHead>
                <TableHead>{t("admin.colName")}</TableHead>
                <TableHead>{t("admin.colUpdated")}</TableHead>
                <TableHead className="text-right">{t("admin.colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t("admin.emptyList")}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((it) => (
                  <TableRow key={it.symbol} className="border-white/10">
                    <TableCell className="font-mono text-sm">
                      <Link
                        href={`/admin/cache/${encodeURIComponent(it.symbol)}`}
                        className="text-emerald-400 hover:underline"
                      >
                        {it.symbol}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">{it.name ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(it.updatedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          nativeButton={false}
                          variant="outline"
                          size="sm"
                          className="h-8 border-emerald-500/40 px-2 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                          title={t("admin.edit")}
                          render={
                            <Link href={`/admin/cache/${encodeURIComponent(it.symbol)}`} />
                          }
                        >
                          <Pencil className="size-3.5 sm:mr-1" aria-hidden />
                          <span className="hidden sm:inline">{t("admin.edit")}</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          disabled={busySymbol === it.symbol}
                          title={t("admin.refreshGemini")}
                          onClick={() => void handleRefresh(it.symbol)}
                        >
                          <RefreshCw
                            className={cn("size-4", busySymbol === it.symbol && "animate-spin")}
                          />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          disabled={busySymbol === it.symbol}
                          title={t("admin.deleteCache")}
                          onClick={() => void handleDelete(it.symbol)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
