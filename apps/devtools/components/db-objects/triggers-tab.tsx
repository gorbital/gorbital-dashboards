"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { Field, Textarea } from "@gorbital/dash/components/input";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Sheet } from "@gorbital/dash/components/sheet";
import { Table, type Column } from "@gorbital/dash/components/table";
import { useFunctions, useTableDetail, useTables, type Change, type DbTrigger } from "@/lib/api/schema";
import { changes, nameFromDefinition, triggerTemplate } from "./changes";
import { DbProblem, SearchInput, matches } from "./common";
import { PlanDialog } from "./plan-dialog";
import { TablePicker, defaultTable } from "./table-picker";

type PlanState = { change: Change; name?: string; title: string; danger?: boolean };

export function TriggersTab({ schema }: { schema: string }) {
  const tables = useTables([schema]);
  const [table, setTable] = useState("");
  useEffect(() => {
    if (tables.data && !tables.data.some((t) => t.name === table)) setTable(defaultTable(tables.data));
  }, [tables.data, table]);
  const detail = useTableDetail(schema, table || undefined);
  const owned = tables.data?.find((t) => t.name === table);
  const editable = owned?.ownership === "user";
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<DbTrigger | null>(null);
  const [creating, setCreating] = useState(false);
  const [plan, setPlan] = useState<PlanState | null>(null);

  const rows = (detail.data?.triggers ?? []).filter((t) => matches(q, t.name, t.function_name, t.timing, ...t.events));
  const columns: Column<DbTrigger>[] = [
    { key: "name", header: "Name", cell: (t) => <span className="font-mono text-text">{t.name}</span> },
    { key: "timing", header: "Timing", cell: (t) => <Badge tone={t.timing === "BEFORE" ? "warn" : t.timing === "INSTEAD OF" ? "violet" : "info"}>{t.timing.toLowerCase()}</Badge> },
    {
      key: "events",
      header: "Events",
      cell: (t) => (
        <span className="flex gap-1">
          {t.events.map((e) => (
            <Badge key={e} tone="muted">
              {e.toLowerCase()}
            </Badge>
          ))}
        </span>
      ),
    },
    { key: "orientation", header: "For each", cell: (t) => <span className="font-mono text-[11px] text-dim">{t.orientation.toLowerCase()}</span> },
    { key: "fn", header: "Function", cell: (t) => <span className="font-mono text-[11px] text-muted">{t.function_schema === schema ? "" : `${t.function_schema}.`}{t.function_name}()</span> },
    { key: "enabled", header: "", cell: (t) => (t.enabled === "disabled" ? <Badge tone="danger">disabled</Badge> : t.enabled !== "origin" ? <Badge tone="muted">{t.enabled}</Badge> : null) },
  ];

  if (tables.error && !tables.data) return <DbProblem error={tables.error} retrying={tables.isFetching} onRetry={() => void tables.refetch()} />;

  return (
    <Panel
      title="Triggers"
      meta={detail.data ? `${rows.length} on ${schema}.${table}` : schema}
      flush
      actions={
        <>
          <TablePicker id="trg-table" tables={tables.data ?? []} value={table} onChange={setTable} loading={tables.isPending} />
          <SearchInput value={q} onChange={setQ} placeholder="Filter triggers" className="w-[200px]" />
          <Button size="sm" kind="primary" icon={<Plus size={11} />} onClick={() => setCreating(true)} disabled={!table || !editable} title={table && !editable ? `${table} is a ${owned?.ownership} table; its triggers belong to the framework` : undefined}>
            New trigger
          </Button>
        </>
      }
    >
      {detail.error ? (
        <div className="p-2">
          <DbProblem error={detail.error} retrying={detail.isFetching} onRetry={() => void detail.refetch()} />
        </div>
      ) : (
        <Table columns={columns} rows={rows} rowKey={(t) => String(t.id)} loading={Boolean(table) && detail.isPending} onRowClick={setOpen} selected={open ? String(open.id) : undefined} dense empty={<Empty title={table ? "No triggers" : "Pick a table"} hint={table ? `${schema}.${table} has no triggers.` : "Triggers belong to a table; choose one above."} />} />
      )}
      {owned && !editable && <p className="border-t border-hairline px-4 py-2 text-[11px] text-dim">{owned.name} is a {owned.ownership} table: the portal shows its triggers but refuses to change them (403 system_table).</p>}

      <Sheet open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)} title={open?.name ?? ""} meta={open ? `${schema}.${table}` : undefined} width="lg" footer={open && editable ? <Button kind="danger" size="sm" icon={<Trash2 size={11} />} onClick={() => setPlan({ change: changes.dropTrigger(schema, table, open), title: `Drop trigger ${open.name}`, danger: true })}>Drop trigger</Button> : undefined}>
        {open && (
          <div className="grid gap-4">
            <KeyList
              rows={[
                { k: "Timing", v: `${open.timing} ${open.events.join(" OR ")}` },
                { k: "For each", v: open.orientation },
                { k: "Function", v: `${open.function_schema}.${open.function_name}()` },
                { k: "Enabled", v: open.enabled },
              ]}
            />
            <Code className="whitespace-pre-wrap break-words">{open.definition}</Code>
          </div>
        )}
      </Sheet>

      <NewTriggerSheet schema={schema} table={table} open={creating} onOpenChange={setCreating} onPlan={setPlan} />
      <PlanDialog open={Boolean(plan)} onOpenChange={(o) => !o && setPlan(null)} change={plan?.change ?? null} name={plan?.name} title={plan?.title} danger={plan?.danger} onApplied={() => { setOpen(null); setCreating(false); }} />
    </Panel>
  );
}

function NewTriggerSheet({ schema, table, open, onOpenChange, onPlan }: { schema: string; table: string; open: boolean; onOpenChange: (o: boolean) => void; onPlan: (p: PlanState) => void }) {
  const fns = useFunctions([schema], open);
  const triggerFns = (fns.data ?? []).filter((f) => f.return_type === "trigger");
  const [definition, setDefinition] = useState("");
  useEffect(() => {
    if (open) setDefinition(triggerTemplate(schema, table, undefined, triggerFns[0]?.name ?? "set_updated_at"));
    // Reset the template when the sheet opens for a table.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, schema, table]);
  const name = nameFromDefinition(definition, "trigger") ?? "";
  const valid = name.length > 0 && /^\s*create/i.test(definition);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="New trigger"
      meta={`${schema}.${table}`}
      description="Write the whole CREATE TRIGGER statement; the Down drops it by name."
      width="lg"
      footer={
        <Button kind="primary" size="sm" disabled={!valid} onClick={() => onPlan({ change: changes.createTrigger(schema, table, name, definition), name: `create_trigger_${name}`, title: `Create trigger ${name}` })}>
          Plan migration
        </Button>
      }
    >
      <div className="grid gap-3">
        <Field label="Definition" htmlFor="trg-def" hint={triggerFns.length ? `Trigger functions in ${schema}: ${triggerFns.map((f) => f.name).join(", ")}` : `No function in ${schema} returns trigger yet; create one under Functions first.`}>
          <Textarea id="trg-def" mono rows={10} value={definition} onChange={(e) => setDefinition(e.target.value)} spellCheck={false} className="text-[11.5px]" />
        </Field>
        <p className="font-mono text-[11px] text-dim">name: {name || "—"}</p>
      </div>
    </Sheet>
  );
}
