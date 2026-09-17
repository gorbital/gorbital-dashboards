"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Input, Select, Switch } from "@gorbital/dash/components/input";
import { Skeleton } from "@gorbital/dash/components/spinner";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import { fmtCompact } from "@gorbital/dash/lib/format";
import { useSchemas, useTables, type Table } from "@/lib/api/db";
import { KindIcon, OwnershipBadge, ProblemNote, kindLabels } from "./common";

type Props = {
  schema: string | undefined;
  table: string | undefined;
  onSchema: (schema: string) => void;
  onTable: (schema: string, table: string) => void;
  onNewTable: () => void;
};

const kindOrder: Record<Table["kind"], number> = { table: 0, partitioned_table: 0, view: 1, materialized_view: 1, foreign_table: 2 };

/** Schema, search, and the relations of that schema with an icon per kind and an ownership badge. */
export function Sidebar({ schema, table, onSchema, onTable, onNewTable }: Props) {
  const [showSystem, setShowSystem] = useState(false);
  const [q, setQ] = useState("");
  const schemas = useSchemas();
  const visibleSchemas = useMemo(() => (schemas.data ?? []).filter((s) => showSystem || !s.system), [schemas.data, showSystem]);
  const current = schema ?? visibleSchemas.find((s) => s.name === "public")?.name ?? visibleSchemas[0]?.name;
  const tables = useTables(current ? [current] : [], Boolean(current));

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (tables.data ?? []).filter((t) => !term || t.name.toLowerCase().includes(term)).sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.name.localeCompare(b.name));
  }, [tables.data, q]);

  return (
    <aside className="flex w-[328px] shrink-0 flex-col overflow-hidden border-r border-hairline bg-bg/30">
      <div className="grid gap-2 border-b border-hairline p-3">
        <div className="flex items-center gap-2">
          <Select value={current ?? ""} onChange={(e) => onSchema(e.target.value)} aria-label="Schema" disabled={!visibleSchemas.length}>
            {!visibleSchemas.length && <option value="">{schemas.isPending ? "loading…" : "no schemas"}</option>}
            {visibleSchemas.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
                {s.system ? " · system" : ""}
              </option>
            ))}
          </Select>
          <Tooltip content="Show PostgreSQL's own schemas (pg_catalog, information_schema)">
            <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-dim">
              <Switch checked={showSystem} onCheckedChange={setShowSystem} aria-label="Show system schemas" />
              sys
            </span>
          </Tooltip>
        </div>
        <div className="relative">
          <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tables" className="pl-7" aria-label="Search tables" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
        {schemas.error && !schemas.data && <ProblemNote error={schemas.error} />}
        {tables.error && !tables.data && <ProblemNote error={tables.error} />}
        {(tables.isPending || schemas.isPending) && !tables.data && !tables.error && !schemas.error && (
          <div className="grid gap-2 px-2 py-1.5">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className={`h-3 ${i % 2 ? "w-2/3" : "w-1/2"}`} />
            ))}
          </div>
        )}
        {tables.data && list.length === 0 && <div className="px-2 py-4 text-center text-[11.5px] text-dim">{q ? "No table matches." : "No tables in this schema yet."}</div>}
        {/* Grid items default to min-width: auto, which would let a long name push the badge past the edge. */}
        <ul className="grid gap-px [&>li]:min-w-0">
          {list.map((t) => {
            const active = t.schema === schema && t.name === table;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onTable(t.schema, t.name)}
                  aria-current={active ? "page" : undefined}
                  className={`group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors ${active ? "bg-elevated text-text" : "text-muted hover:bg-elevated/60 hover:text-text"}`}
                  title={`${t.name}${t.comment ? ` · ${t.comment}` : ""} · ${kindLabels[t.kind]} · ${t.size}`}
                >
                  <KindIcon kind={t.kind} className={active ? "text-primary" : "text-dim group-hover:text-muted"} />
                  <span className="min-w-0 flex-1 truncate font-mono">{t.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <OwnershipBadge ownership={t.ownership} />
                    {t.kind !== "view" && t.kind !== "materialized_view" && <span className="min-w-[18px] text-right font-mono text-[10px] tnum text-faint">{fmtCompact(t.live_rows || t.row_estimate)}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="border-t border-hairline p-2">
        <Button size="sm" kind="secondary" icon={<Plus size={11} />} className="w-full justify-center" onClick={onNewTable} disabled={!current}>
          New table
        </Button>
      </div>
    </aside>
  );
}
