"use client";

import { Badge } from "@gorbital/dash/components/badge";
import { Code } from "@gorbital/dash/components/code";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Table, type Column as TableColumn } from "@gorbital/dash/components/table";
import { fmtBytes, fmtInt } from "@gorbital/dash/lib/format";
import type { Tone } from "@gorbital/dash/theme";
import type { Column, Constraint, Index, TableDetail, Trigger } from "@/lib/api/db";
import { createTableSQL } from "@/lib/table-editor/definition";
import { kindLabels, shortType } from "./common";

const constraintNames: Record<Constraint["type"], string> = { p: "primary key", u: "unique", f: "foreign key", c: "check", x: "exclusion" };
const constraintTones: Record<Constraint["type"], Tone> = { p: "warn", u: "violet", f: "info", c: "muted", x: "muted" };

const columnCols: TableColumn<Column>[] = [
  { key: "name", header: "Column", cell: (c) => <span className="font-mono text-text">{c.name}</span> },
  { key: "type", header: "Type", cell: (c) => <span className="font-mono text-muted">{c.data_type}</span> },
  { key: "null", header: "Nullable", cell: (c) => (c.is_nullable ? <span className="text-dim">yes</span> : <span className="font-mono text-[11px] text-text">NOT NULL</span>) },
  {
    key: "default",
    header: "Default",
    cell: (c) => <span className="font-mono text-muted">{c.identity ? `identity (${c.identity === "a" ? "always" : "by default"})` : c.generation_expr ? `generated: ${c.generation_expr}` : (c.default_expr ?? "")}</span>,
  },
  {
    key: "flags",
    header: "",
    cell: (c) => (
      <span className="flex gap-1">
        {c.is_primary_key && <Badge tone="warn">pk</Badge>}
        {c.is_unique && !c.is_primary_key && <Badge tone="violet">unique</Badge>}
        {c.fk_targets?.map((t) => (
          <Badge key={t} tone="info">
            → {t}
          </Badge>
        ))}
        {c.enum_values && <Badge tone="muted">enum</Badge>}
      </span>
    ),
  },
  { key: "comment", header: "Comment", cell: (c) => <span className="text-dim">{c.comment ?? ""}</span> },
];

const constraintCols: TableColumn<Constraint>[] = [
  { key: "name", header: "Constraint", cell: (c) => <span className="font-mono text-text">{c.name}</span> },
  { key: "type", header: "Type", cell: (c) => <Badge tone={constraintTones[c.type]}>{constraintNames[c.type]}</Badge> },
  { key: "def", header: "Definition", cell: (c) => <span className="font-mono text-muted">{c.definition}</span> },
  { key: "flags", header: "", cell: (c) => <span className="text-dim">{[c.deferrable && "deferrable", !c.validated && "not validated"].filter(Boolean).join(" · ")}</span> },
];

const indexCols: TableColumn<Index>[] = [
  { key: "name", header: "Index", cell: (i) => <span className="font-mono text-text">{i.name}</span> },
  { key: "def", header: "Definition", cell: (i) => <span className="font-mono text-muted">{i.definition.replace(/^CREATE (UNIQUE )?INDEX \S+ ON \S+ /, "")}</span> },
  {
    key: "flags",
    header: "",
    cell: (i) => (
      <span className="flex gap-1">
        {i.is_primary && <Badge tone="warn">pk</Badge>}
        {i.is_unique && !i.is_primary && <Badge tone="violet">unique</Badge>}
        {i.is_partial && <Badge tone="muted">partial</Badge>}
        {!i.is_valid && <Badge tone="danger">invalid</Badge>}
      </span>
    ),
  },
  { key: "size", header: "Size", align: "right", cell: (i) => <span className="font-mono tnum text-dim">{fmtBytes(i.bytes)}</span> },
  { key: "scans", header: "Scans", align: "right", cell: (i) => <span className="font-mono tnum text-dim">{fmtInt(i.scans)}</span> },
];

const triggerCols: TableColumn<Trigger>[] = [
  { key: "name", header: "Trigger", cell: (t) => <span className="font-mono text-text">{t.name}</span> },
  { key: "when", header: "When", cell: (t) => <span className="font-mono text-muted">{`${t.timing} ${t.events.join(" OR ")} · ${t.orientation}`}</span> },
  { key: "fn", header: "Function", cell: (t) => <span className="font-mono text-muted">{`${t.function_schema}.${t.function_name}()`}</span> },
  { key: "enabled", header: "", cell: (t) => (t.enabled === "disabled" ? <Badge tone="danger">disabled</Badge> : <Badge tone="ok">{t.enabled}</Badge>) },
];

/** The table's columns, constraints, indexes, triggers, and a CREATE TABLE built from them. */
export function Definition({ detail }: { detail: TableDetail }) {
  const t = detail.table;
  return (
    <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-4">
      <Panel title="Overview" meta={`${t.schema}.${t.name}`}>
        <KeyList
          rows={[
            { k: "Kind", v: kindLabels[t.kind] },
            { k: "Ownership", v: t.ownership },
            { k: "Rows", v: `${fmtInt(t.live_rows)} live · ${fmtInt(t.row_estimate)} estimated` },
            { k: "Size", v: `${t.size} (${fmtBytes(t.bytes)})` },
            { k: "Owner", v: t.owner },
            { k: "Row level security", v: t.rls_enabled ? (t.rls_forced ? "enabled, forced" : "enabled") : "off" },
            { k: "Primary key", v: detail.primary_key.length ? detail.primary_key.join(", ") : "none" },
            { k: "Comment", v: t.comment ?? "—" },
          ]}
        />
      </Panel>
      <Panel title="Columns" meta={`${detail.columns.length}`} flush>
        <Table columns={columnCols} rows={detail.columns} rowKey={(c) => c.name} dense empty={<Empty title="No columns" />} />
      </Panel>
      <Panel title="Constraints" meta={`${detail.constraints.length}`} flush>
        <Table columns={constraintCols} rows={detail.constraints} rowKey={(c) => c.name} dense empty={<Empty title="No constraints" hint="Add a primary key, a unique constraint or a foreign key from a column's menu." />} />
      </Panel>
      <Panel title="Indexes" meta={`${detail.indexes.length}`} flush>
        <Table columns={indexCols} rows={detail.indexes} rowKey={(i) => i.name} dense empty={<Empty title="No indexes" />} />
      </Panel>
      <Panel title="Triggers" meta={`${detail.triggers.length}`} flush>
        <Table columns={triggerCols} rows={detail.triggers} rowKey={(tr) => tr.name} dense empty={<Empty title="No triggers" />} />
      </Panel>
      <Panel title="Definition" meta="reconstructed from the catalog; not the migration that made it">
        <Code className="max-h-[480px] overflow-auto text-text">{createTableSQL(detail)}</Code>
      </Panel>
      <div className="pb-2 text-center font-mono text-[10.5px] text-faint">{detail.columns.map(shortType).join(" · ")}</div>
    </div>
  );
}
