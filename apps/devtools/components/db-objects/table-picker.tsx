"use client";

import { Select } from "@gorbital/dash/components/input";
import type { DbTable, Ownership } from "@/lib/api/schema";

const groups: { key: Ownership; label: string }[] = [
  { key: "user", label: "App tables" },
  { key: "managed", label: "Managed (gorbital modules)" },
  { key: "system", label: "System" },
];

/** A select of the schema's tables, grouped by ownership; views and materialized views are left out. */
export function TablePicker({ tables, value, onChange, id, loading }: { tables: DbTable[]; value: string; onChange: (name: string) => void; id?: string; loading?: boolean }) {
  const real = tables.filter((t) => t.kind === "table" || t.kind === "partitioned_table");
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={loading} className="max-w-[320px] font-mono">
      <option value="">{loading ? "loading tables…" : real.length ? "Pick a table" : "No tables"}</option>
      {groups.map((g) => {
        const rows = real.filter((t) => t.ownership === g.key);
        if (!rows.length) return null;
        return (
          <optgroup key={g.key} label={g.label}>
            {rows.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </Select>
  );
}

/** The first table worth selecting: the app's own first, then managed, then system. */
export function defaultTable(tables: DbTable[]): string {
  const real = tables.filter((t) => t.kind === "table" || t.kind === "partitioned_table");
  return (real.find((t) => t.ownership === "user") ?? real.find((t) => t.ownership === "managed") ?? real[0])?.name ?? "";
}
