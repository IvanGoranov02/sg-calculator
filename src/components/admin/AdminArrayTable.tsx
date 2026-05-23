"use client";

import { Trash2 } from "lucide-react";

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

export type AdminColumnDef<Row extends Record<string, unknown>> = {
  key: keyof Row & string;
  label: string;
  type?: "text" | "number";
  nullable?: boolean;
};

type Props<Row extends Record<string, unknown>> = {
  columns: AdminColumnDef<Row>[];
  rows: Row[];
  onChange: (rows: Row[]) => void;
  onAddRow: () => Row;
  addLabel: string;
};

export function AdminArrayTable<Row extends Record<string, unknown>>({
  columns,
  rows,
  onChange,
  onAddRow,
  addLabel,
}: Props<Row>) {
  const updateCell = (rowIndex: number, key: keyof Row & string, raw: string) => {
    const col = columns.find((c) => c.key === key);
    const next = rows.map((row, i) => {
      if (i !== rowIndex) return row;
      if (col?.type === "number") {
        if (raw.trim() === "" && col.nullable) {
          return { ...row, [key]: null };
        }
        const n = Number(raw);
        return { ...row, [key]: Number.isFinite(n) ? n : row[key] };
      }
      return { ...row, [key]: raw };
    });
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              {columns.map((c) => (
                <TableHead key={c.key} className="whitespace-nowrap text-xs">
                  {c.label}
                </TableHead>
              ))}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, ri) => (
              <TableRow key={ri} className="border-white/10">
                {columns.map((c) => {
                  const val = row[c.key];
                  const display =
                    val == null
                      ? ""
                      : typeof val === "number"
                        ? String(val)
                        : String(val);
                  return (
                    <TableCell key={c.key} className="p-1">
                      <Input
                        className="h-8 min-w-[4.5rem] border-white/10 bg-zinc-900/80 text-xs"
                        type={c.type === "number" ? "number" : "text"}
                        value={display}
                        onChange={(e) => updateCell(ri, c.key, e.target.value)}
                      />
                    </TableCell>
                  );
                })}
                <TableCell className="p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => onChange(rows.filter((_, i) => i !== ri))}
                    aria-label="Remove row"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-white/15"
        onClick={() => onChange([...rows, onAddRow()])}
      >
        {addLabel}
      </Button>
    </div>
  );
}
