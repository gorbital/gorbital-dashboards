"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { Checkbox, Field, Input, Select } from "@gorbital/dash/components/input";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Sheet } from "@gorbital/dash/components/sheet";
import { Table, type Column } from "@gorbital/dash/components/table";
import { fmtBytes } from "@gorbital/dash/lib/format";
import { useTableDetail, useTables, type Change, type DbColumn, type DbIndex } from "@/lib/api/schema";
import { changes } from "./changes";
import { DbProblem, SearchInput, matches } from "./common";
import { PlanDialog } from "./plan-dialog";
import { TablePicker, defaultTable } from "./table-picker";

type PlanState = { change: Change; name?: string; title: string; danger?: boolean };

const methods = ["btree", "hash", "gin", "gist", "brin", "spgist"];

export function IndexesTab({ schema }: { schema: string }) {
  const tables = useTables([schema]);
  const [table, setTable] = useState("");
  useEffect(() => {
    if (tables.data && !tables.data.some((t) => t.name === table)) setTable(defaultTable(tables.data));
  }, [tables.data, table]);
  const detail = useTableDetail(schema, table || undefined);
  const owned = tables.data?.find((t) => t.name === table);
  const editable = owned?.ownership === "user";
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<DbIndex | null>(null);
  const [creating, setCreating] = useState(false);
  const [plan, setPlan] = useState<PlanState | null>(null);

  const rows = (detail.data?.indexes ?? []).filter((i) => matches(q, i.name, i.method, i.columns.join(" ")));
  const columns: Column<DbIndex>[] = [
    { key: "name", header: "Name", cell: (i) => <span className="font-mono text-text">{i.name}</span> },
    { key: "columns", header: "Columns", cell: (i) => <span className="font-mono text-[11px] text-muted">{i.columns.join(", ")}</span> },
    { key: "method", header: "Method", width: "80px", cell: (i) => <Badge tone="muted">{i.method}</Badge> },
    {
      key: "flags",
      header: "",
      cell: (i) => (
        <span className="flex gap-1">
          {i.is_primary && <Badge tone="warn">primary</Badge>}
          {i.is_unique && !i.is_primary && <Badge tone="violet">unique</Badge>}
          {i.is_partial && <Badge tone="info">partial</Badge>}
          {!i.is_valid && <Badge tone="danger">invalid</Badge>}
          {i.scans === 0 && !i.is_primary && <Badge tone="warn">unused</Badge>}
        </span>
      ),
    },
    { key: "size", header: "Size", align: "right", width: "90px", cell: (i) => <span className="font-mono text-[11px] text-muted tnum">{fmtBytes(i.bytes)}</span> },
    { key: "scans", header: "Scans", align: "right", width: "90px", cell: (i) => <span className={`font-mono text-[11px] tnum ${i.scans === 0 ? "text-warn" : "text-muted"}`}>{i.scans.toLocaleString()}</span> },
  ];

  if (tables.error && !tables.data) return <DbProblem error={tables.error} retrying={tables.isFetching} onRetry={() => void tables.refetch()} />;

  return (
    <Panel
      title="Indexes"
      meta={detail.data ? `${rows.length} on ${schema}.${table} · ${fmtBytes(detail.data.indexes.reduce((a, i) => a + i.bytes, 0))}` : schema}
      flush
      actions={
        <>
          <TablePicker id="idx-table" tables={tables.data ?? []} value={table} onChange={setTable} loading={tables.isPending} />
          <SearchInput value={q} onChange={setQ} placeholder="Filter indexes" className="w-[200px]" />
          <Button size="sm" kind="primary" icon={<Plus size={11} />} onClick={() => setCreating(true)} disabled={!table || !editable} title={table && !editable ? `${table} is a ${owned?.ownership} table; its indexes belong to the framework` : undefined}>
            New index
          </Button>
        </>
      }
    >
      {detail.error ? (
        <div className="p-2">
          <DbProblem error={detail.error} retrying={detail.isFetching} onRetry={() => void detail.refetch()} />
        </div>
      ) : (
        <Table columns={columns} rows={rows} rowKey={(i) => String(i.id)} loading={Boolean(table) && detail.isPending} onRowClick={setOpen} selected={open ? String(open.id) : undefined} dense empty={<Empty title={table ? "No indexes" : "Pick a table"} hint={table ? `${schema}.${table} has no indexes, not even a primary key.` : "Indexes belong to a table; choose one above."} />} />
      )}
      {owned && !editable && <p className="border-t border-hairline px-4 py-2 text-[11px] text-dim">{owned.name} is a {owned.ownership} table: the portal shows its indexes but refuses to change them (403 system_table).</p>}

      <Sheet open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)} title={open?.name ?? ""} meta={open ? `${schema}.${table}` : undefined} width="lg" footer={open && editable && !open.is_primary ? <Button kind="danger" size="sm" icon={<Trash2 size={11} />} onClick={() => setPlan({ change: changes.dropIndex(schema, table, open.name), title: `Drop index ${open.name}`, danger: true })}>Drop index</Button> : undefined}>
        {open && (
          <div className="grid gap-4">
            <KeyList
              rows={[
                { k: "Columns", v: open.columns.join(", ") },
                { k: "Method", v: open.method },
                { k: "Size", v: fmtBytes(open.bytes) },
                { k: "Scans", v: `${open.scans.toLocaleString()}${open.last_scan ? ` · last ${new Date(open.last_scan).toLocaleString()}` : open.scans === 0 ? " · never" : ""}` },
                { k: "Flags", v: [open.is_primary && "primary", open.is_unique && "unique", open.is_partial && "partial", !open.is_valid && "invalid"].filter(Boolean).join(", ") || "—" },
              ]}
            />
            <Code className="whitespace-pre-wrap break-words">{open.definition}</Code>
            {open.is_primary && <p className="text-[11px] text-dim">The primary key's index goes with its constraint; drop the constraint in the Table Editor instead.</p>}
            {open.scans === 0 && !open.is_primary && <p className="text-[11px] text-warn">No scan has used this index since the statistics were reset; it may cost writes for nothing.</p>}
          </div>
        )}
      </Sheet>

      <NewIndexSheet schema={schema} table={table} columns={detail.data?.columns ?? []} open={creating} onOpenChange={setCreating} onPlan={setPlan} />
      <PlanDialog open={Boolean(plan)} onOpenChange={(o) => !o && setPlan(null)} change={plan?.change ?? null} name={plan?.name} title={plan?.title} danger={plan?.danger} onApplied={() => { setOpen(null); setCreating(false); }} />
    </Panel>
  );
}

function NewIndexSheet({ schema, table, columns, open, onOpenChange, onPlan }: { schema: string; table: string; columns: DbColumn[]; open: boolean; onOpenChange: (o: boolean) => void; onPlan: (p: PlanState) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [exprs, setExprs] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [unique, setUnique] = useState(false);
  const [method, setMethod] = useState("");
  const [where, setWhere] = useState("");
  const [concurrently, setConcurrently] = useState(false);
  useEffect(() => {
    if (open) {
      setPicked([]);
      setExprs([]);
      setName("");
      setUnique(false);
      setMethod("");
      setWhere("");
      setConcurrently(false);
    }
  }, [open, table]);

  const all = [...picked, ...exprs.map((e) => e.trim()).filter(Boolean).map((e) => (e.startsWith("(") ? e : `(${e})`))];
  const suggested = `${table}_${[...picked, ...exprs.filter((e) => e.trim()).map(() => "expr")].join("_")}_idx`;
  const toggle = (c: string) => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="New index"
      meta={`${schema}.${table}`}
      description="Columns in order, or expressions; the Down drops the index."
      width="md"
      footer={
        <Button kind="primary" size="sm" disabled={all.length === 0} onClick={() => onPlan({ change: changes.createIndex(schema, table, { name, columns: all, unique, method, where, concurrently }), name: `create_index_${name || suggested}`, title: `Create index ${name || suggested}` })}>
          Plan migration
        </Button>
      }
    >
      <div className="grid gap-3">
        <Field label="Columns" hint="Click to add in order; the order is the index's key order">
          <div className="flex flex-wrap gap-1">
            {columns.map((c) => {
              const at = picked.indexOf(c.name);
              return (
                <button key={c.name} type="button" onClick={() => toggle(c.name)} className={`inline-flex h-6 items-center whitespace-nowrap gap-1 rounded-md border px-1.5 font-mono text-[11px] transition-colors ${at >= 0 ? "border-primary/40 bg-primary/10 text-text" : "border-border bg-elevated text-muted hover:border-border-2"}`}>
                  {at >= 0 && <span className="text-[9px] text-primary tnum">{at + 1}</span>}
                  {c.name}
                  <span className="text-[9.5px] text-dim">{c.data_type}</span>
                </button>
              );
            })}
            {columns.length === 0 && <span className="text-[11px] text-dim">no columns</span>}
          </div>
        </Field>
        <Field label="Expressions" hint="One per row, such as lower(email) or (data->>'id')">
          <div className="grid gap-1">
            {exprs.map((e, i) => (
              <span key={i} className="flex gap-1">
                <Input mono value={e} onChange={(ev) => setExprs((x) => x.map((v, j) => (j === i ? ev.target.value : v)))} placeholder="lower(email)" />
                <Button kind="ghost" size="md" icon={<X size={11} />} onClick={() => setExprs((x) => x.filter((_, j) => j !== i))} aria-label="Remove expression">
                  {""}
                </Button>
              </span>
            ))}
            <Button kind="ghost" size="sm" icon={<Plus size={11} />} onClick={() => setExprs((x) => [...x, ""])} className="justify-self-start">
              Add expression
            </Button>
          </div>
        </Field>
        <Field label="Name" htmlFor="idx-name" hint={`${suggested} when empty`}>
          <Input id="idx-name" mono value={name} onChange={(e) => setName(e.target.value)} placeholder={suggested} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Method" htmlFor="idx-method">
            <Select id="idx-method" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">btree (default)</option>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Where" htmlFor="idx-where" hint="Partial index predicate">
            <Input id="idx-where" mono value={where} onChange={(e) => setWhere(e.target.value)} placeholder="deleted_at IS NULL" />
          </Field>
        </div>
        <Field label="unique" htmlFor="idx-unique" inline>
          <Checkbox id="idx-unique" checked={unique} onCheckedChange={(c) => setUnique(c === true)} />
          <span>Unique: rejects duplicate keys</span>
        </Field>
        <Field label="concurrently" htmlFor="idx-conc" inline hint="Builds without locking writes; the migration runs outside a transaction (+goose NO TRANSACTION)">
          <Checkbox id="idx-conc" checked={concurrently} onCheckedChange={(c) => setConcurrently(c === true)} />
          <span>Concurrently</span>
        </Field>
      </div>
    </Sheet>
  );
}
