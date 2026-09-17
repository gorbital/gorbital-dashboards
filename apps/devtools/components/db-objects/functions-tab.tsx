"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { Field, Input, Textarea } from "@gorbital/dash/components/input";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Sheet } from "@gorbital/dash/components/sheet";
import { Table, type Column } from "@gorbital/dash/components/table";
import { useTableSort } from "@gorbital/dash/components/table-sort";
import { useFunctions, type Change, type DbFunction } from "@/lib/api/schema";
import { changes, functionTemplate, nameFromDefinition, signatureFromDefinition, signatureOf, triggerFunctionTemplate } from "./changes";
import { DbProblem, SearchInput, matches } from "./common";
import { PlanDialog } from "./plan-dialog";

type PlanState = { change: Change; name?: string; title: string; danger?: boolean };

export function FunctionsTab({ schema }: { schema: string }) {
  const fns = useFunctions([schema]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<DbFunction | null>(null);
  const [creating, setCreating] = useState(false);
  const [plan, setPlan] = useState<PlanState | null>(null);
  const { sort, onSort } = useTableSort({ key: "name", dir: "asc" });

  const rows = (fns.data ?? []).filter((f) => matches(q, f.name, f.args, f.return_type, f.language));
  const columns: Column<DbFunction>[] = [
    { key: "name", header: "Name", sortValue: (f) => f.name, cell: (f) => <span className="font-mono text-text">{f.name}</span> },
    { key: "args", header: "Arguments", cell: (f) => <span className="font-mono text-[11px] text-muted">{f.args || <span className="text-faint">none</span>}</span> },
    { key: "returns", header: "Returns", cell: (f) => <span className="font-mono text-[11px] text-muted">{f.returns_set ? "setof " : ""}{f.return_type ?? "void"}</span> },
    { key: "language", header: "Language", sortValue: (f) => f.language, cell: (f) => <Badge tone="muted">{f.language}</Badge> },
    { key: "volatility", header: "Volatility", sortValue: (f) => f.volatility, cell: (f) => <span className="font-mono text-[11px] text-dim">{f.volatility.toLowerCase()}</span> },
    {
      key: "flags",
      header: "",
      cell: (f) => (
        <span className="flex gap-1">
          {f.kind !== "function" && <Badge tone="info">{f.kind}</Badge>}
          {f.security_definer && <Badge tone="warn">security definer</Badge>}
          {f.from_extension && <Badge tone="muted">extension</Badge>}
        </span>
      ),
    },
  ];

  if (fns.error && !fns.data) return <DbProblem error={fns.error} retrying={fns.isFetching} onRetry={() => void fns.refetch()} />;

  return (
    <Panel
      title="Functions"
      meta={fns.data ? `${rows.length} of ${fns.data.length} · ${schema}` : schema}
      flush
      actions={
        <>
          <SearchInput value={q} onChange={setQ} placeholder="Filter functions" className="w-[220px]" />
          <Button size="sm" kind="primary" icon={<Plus size={11} />} onClick={() => setCreating(true)}>
            New function
          </Button>
        </>
      }
    >
      <Table columns={columns} rows={rows} rowKey={(f) => String(f.id)} loading={fns.isPending} sort={sort} onSort={onSort} onRowClick={setOpen} selected={open ? String(open.id) : undefined} dense empty={<Empty title="No functions" hint={q ? "Nothing matches the filter." : `${schema} has no functions; create one, or enable an extension.`} />} />

      <Sheet open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)} title={open?.name ?? ""} meta={open ? `${open.schema} · ${open.kind}` : undefined} width="lg" footer={open && !open.from_extension ? <Button kind="danger" size="sm" icon={<Trash2 size={11} />} onClick={() => setPlan({ change: changes.dropFunction(open), title: `Drop ${signatureOf(open)}`, danger: true })}>Drop function</Button> : undefined}>
        {open && (
          <div className="grid gap-4">
            <KeyList
              rows={[
                { k: "Signature", v: signatureOf(open) },
                { k: "Returns", v: `${open.returns_set ? "setof " : ""}${open.return_type ?? "void"}` },
                { k: "Language", v: open.language },
                { k: "Volatility", v: open.volatility },
                { k: "Security", v: open.security_definer ? "definer" : "invoker" },
                ...(open.comment ? [{ k: "Comment", v: open.comment }] : []),
              ]}
            />
            {open.definition ? <Code className="whitespace-pre-wrap break-words">{open.definition}</Code> : <Empty title="No definition" hint={open.from_extension ? "An extension provides this function." : "Internal functions have no SQL body."} />}
            {open.from_extension && <p className="text-[11px] text-dim">Functions an extension owns are dropped with the extension, not one by one.</p>}
          </div>
        )}
      </Sheet>

      <NewFunctionSheet schema={schema} open={creating} onOpenChange={setCreating} onPlan={(p) => setPlan(p)} />
      <PlanDialog open={Boolean(plan)} onOpenChange={(o) => !o && setPlan(null)} change={plan?.change ?? null} name={plan?.name} title={plan?.title} danger={plan?.danger} onApplied={() => { setOpen(null); setCreating(false); }} />
    </Panel>
  );
}

function NewFunctionSheet({ schema, open, onOpenChange, onPlan }: { schema: string; open: boolean; onOpenChange: (o: boolean) => void; onPlan: (p: PlanState) => void }) {
  const [definition, setDefinition] = useState(() => functionTemplate(schema));
  const [signature, setSignature] = useState(() => signatureFromDefinition(functionTemplate(schema)) ?? "");
  const [touched, setTouched] = useState(false);
  const name = nameFromDefinition(definition, "function") ?? "";

  const setDef = (d: string) => {
    setDefinition(d);
    if (!touched) setSignature(signatureFromDefinition(d) ?? "");
  };
  const valid = name.length > 0 && signature.includes("(") && /^\s*create/i.test(definition);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="New function"
      meta={schema}
      description="Write the whole CREATE FUNCTION statement; the migration's Down drops it by signature."
      width="lg"
      footer={
        <>
          <Button kind="ghost" size="sm" onClick={() => setDef(triggerFunctionTemplate(schema))}>
            Trigger template
          </Button>
          <Button kind="ghost" size="sm" onClick={() => setDef(functionTemplate(schema))}>
            SQL template
          </Button>
          <Button kind="primary" size="sm" disabled={!valid} onClick={() => onPlan({ change: changes.createFunction(schema, name, signature.trim(), definition), name: `create_function_${name}`, title: `Create function ${name}` })}>
            Plan migration
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Definition" htmlFor="fn-def" hint="The statement as PostgreSQL will run it. Qualify the name with the schema.">
          <Textarea id="fn-def" mono rows={16} value={definition} onChange={(e) => setDef(e.target.value)} spellCheck={false} className="text-[11.5px]" />
        </Field>
        <Field label="Signature" htmlFor="fn-sig" hint="name(argument types), as DROP FUNCTION needs it; read from the definition until you edit it" error={!signature.includes("(") ? "the signature needs parentheses, such as add_one(integer)" : undefined}>
          <Input id="fn-sig" mono value={signature} onChange={(e) => { setTouched(true); setSignature(e.target.value); }} />
        </Field>
        <p className="font-mono text-[11px] text-dim">name: {name || "—"}</p>
      </div>
    </Sheet>
  );
}
