"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { Field, Input, Switch, Textarea } from "@gorbital/dash/components/input";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Sheet } from "@gorbital/dash/components/sheet";
import { Table, type Column } from "@gorbital/dash/components/table";
import { useTables, useViews, type Change, type DbView } from "@/lib/api/schema";
import { changes, viewTemplate } from "./changes";
import { DbProblem, SearchInput, matches } from "./common";
import { PlanDialog } from "./plan-dialog";
import { defaultTable } from "./table-picker";

type PlanState = { change: Change; name?: string; title: string; danger?: boolean };

export function ViewsTab({ schema }: { schema: string }) {
  const views = useViews([schema]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<DbView | null>(null);
  const [creating, setCreating] = useState(false);
  const [plan, setPlan] = useState<PlanState | null>(null);

  const rows = (views.data ?? []).filter((v) => matches(q, v.name, v.definition));
  const columns: Column<DbView>[] = [
    { key: "name", header: "Name", width: "240px", cell: (v) => <span className="font-mono text-text">{v.name}</span> },
    {
      key: "flags",
      header: "",
      width: "220px",
      cell: (v) => (
        <span className="flex gap-1">
          {v.is_materialized ? <Badge tone="violet">materialized</Badge> : <Badge tone="muted">view</Badge>}
          {v.is_updatable && <Badge tone="ok">updatable</Badge>}
          {v.is_materialized && v.is_populated === false && <Badge tone="warn">not populated</Badge>}
        </span>
      ),
    },
    { key: "def", header: "Definition", cell: (v) => <code className="block max-w-[560px] truncate font-mono text-[11px] text-dim">{v.definition.replace(/\s+/g, " ").trim()}</code> },
  ];

  if (views.error && !views.data) return <DbProblem error={views.error} retrying={views.isFetching} onRetry={() => void views.refetch()} />;

  return (
    <Panel
      title="Views"
      meta={views.data ? `${rows.length} of ${views.data.length} · ${schema}` : schema}
      flush
      actions={
        <>
          <SearchInput value={q} onChange={setQ} placeholder="Filter views" className="w-[220px]" />
          <Button size="sm" kind="primary" icon={<Plus size={11} />} onClick={() => setCreating(true)}>
            New view
          </Button>
        </>
      }
    >
      <Table columns={columns} rows={rows} rowKey={(v) => String(v.id)} loading={views.isPending} onRowClick={setOpen} selected={open ? String(open.id) : undefined} dense empty={<Empty title="No views" hint={q ? "Nothing matches the filter." : `${schema} has no views.`} />} />

      <Sheet open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)} title={open?.name ?? ""} meta={open ? `${open.schema} · ${open.is_materialized ? "materialized view" : "view"}` : undefined} width="lg" footer={open ? <Button kind="danger" size="sm" icon={<Trash2 size={11} />} onClick={() => setPlan({ change: changes.dropView(open), title: `Drop view ${open.name}`, danger: true })}>Drop view</Button> : undefined}>
        {open && (
          <div className="grid gap-4">
            <KeyList rows={[{ k: "Updatable", v: open.is_updatable ? "yes" : "no" }, ...(open.is_materialized ? [{ k: "Populated", v: open.is_populated ? "yes" : "no" }] : []), ...(open.comment ? [{ k: "Comment", v: open.comment }] : [])]} />
            <Code className="whitespace-pre-wrap break-words">
              CREATE {open.is_materialized ? "MATERIALIZED VIEW" : "VIEW"} {open.schema}.{open.name} AS{"\n"}
              {open.definition.trim()}
            </Code>
          </div>
        )}
      </Sheet>

      <NewViewSheet schema={schema} open={creating} onOpenChange={setCreating} onPlan={setPlan} />
      <PlanDialog open={Boolean(plan)} onOpenChange={(o) => !o && setPlan(null)} change={plan?.change ?? null} name={plan?.name} title={plan?.title} danger={plan?.danger} onApplied={() => { setOpen(null); setCreating(false); }} />
    </Panel>
  );
}

function NewViewSheet({ schema, open, onOpenChange, onPlan }: { schema: string; open: boolean; onOpenChange: (o: boolean) => void; onPlan: (p: PlanState) => void }) {
  const tables = useTables([schema], open);
  const [name, setName] = useState("");
  const [sql, setSql] = useState("");
  const [materialized, setMaterialized] = useState(false);
  useEffect(() => {
    if (open) {
      setName("");
      setMaterialized(false);
      setSql(viewTemplate(schema, tables.data ? defaultTable(tables.data) || undefined : undefined));
    }
    // The template is seeded once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, schema, tables.data !== undefined]);
  const valid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && /^\s*(select|with|values|table)\b/i.test(sql);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="New view"
      meta={schema}
      description="The SELECT the view is defined as; the Down drops it."
      width="lg"
      footer={
        <Button kind="primary" size="sm" disabled={!valid} onClick={() => onPlan({ change: changes.createView(schema, name, sql, materialized), name: `create_view_${name}`, title: `Create view ${name}` })}>
          Plan migration
        </Button>
      }
    >
      <div className="grid gap-3">
        <Field label="Name" htmlFor="view-name" hint={`Created as ${schema}.${name || "…"}`}>
          <Input id="view-name" mono autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="active_projects" />
        </Field>
        <Field label="Query" htmlFor="view-sql" hint="Starts with SELECT (or WITH); no trailing semicolon needed" error={sql.trim() && !/^\s*(select|with|values|table)\b/i.test(sql) ? "a view is defined by a SELECT" : undefined}>
          <Textarea id="view-sql" mono rows={12} value={sql} onChange={(e) => setSql(e.target.value)} spellCheck={false} className="text-[11.5px]" />
        </Field>
        <Field label="materialized" htmlFor="view-mat" inline hint="Stores the result; refresh it with REFRESH MATERIALIZED VIEW">
          <Switch id="view-mat" checked={materialized} onCheckedChange={setMaterialized} />
          <span>Materialized</span>
        </Field>
      </div>
    </Sheet>
  );
}
