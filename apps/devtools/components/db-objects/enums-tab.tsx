"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Dialog } from "@gorbital/dash/components/dialog";
import { Field, Input, Select, Textarea } from "@gorbital/dash/components/input";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Sheet } from "@gorbital/dash/components/sheet";
import { Table, type Column } from "@gorbital/dash/components/table";
import { useEnums, type Change, type DbEnum } from "@/lib/api/schema";
import { changes } from "./changes";
import { DbProblem, SearchInput, matches } from "./common";
import { PlanDialog } from "./plan-dialog";

type PlanState = { change: Change; name?: string; title: string; danger?: boolean };
type Editing = { kind: "new" } | { kind: "add"; enum: DbEnum } | { kind: "rename"; enum: DbEnum; value: string };

export function EnumsTab({ schema }: { schema: string }) {
  const enums = useEnums([schema]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<DbEnum | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [plan, setPlan] = useState<PlanState | null>(null);

  const rows = (enums.data ?? []).filter((e) => matches(q, e.name, e.values.join(" ")));
  const columns: Column<DbEnum>[] = [
    { key: "name", header: "Name", width: "240px", cell: (e) => <span className="font-mono text-text">{e.name}</span> },
    {
      key: "values",
      header: "Values",
      cell: (e) => (
        <span className="flex flex-wrap gap-1">
          {e.values.map((v) => (
            <Badge key={v} tone="muted">
              {v}
            </Badge>
          ))}
        </span>
      ),
    },
    { key: "n", header: "", align: "right", cell: (e) => <span className="font-mono text-[11px] text-dim tnum">{e.values.length}</span> },
  ];

  if (enums.error && !enums.data) return <DbProblem error={enums.error} retrying={enums.isFetching} onRetry={() => void enums.refetch()} />;
  const current = open ? (enums.data?.find((e) => e.id === open.id) ?? open) : null;

  return (
    <Panel
      title="Enums"
      meta={enums.data ? `${rows.length} of ${enums.data.length} · ${schema}` : schema}
      flush
      actions={
        <>
          <SearchInput value={q} onChange={setQ} placeholder="Filter enums" className="w-[220px]" />
          <Button size="sm" kind="primary" icon={<Plus size={11} />} onClick={() => setEditing({ kind: "new" })}>
            New enum
          </Button>
        </>
      }
    >
      <Table columns={columns} rows={rows} rowKey={(e) => String(e.id)} loading={enums.isPending} onRowClick={setOpen} selected={open ? String(open.id) : undefined} dense empty={<Empty title="No enums" hint={q ? "Nothing matches the filter." : `${schema} has no enumerated types.`} />} />

      <Sheet
        open={Boolean(current)}
        onOpenChange={(o) => !o && setOpen(null)}
        title={current?.name ?? ""}
        meta={current ? `${current.schema} · enum` : undefined}
        footer={
          current ? (
            <>
              <Button kind="secondary" size="sm" icon={<Plus size={11} />} onClick={() => setEditing({ kind: "add", enum: current })}>
                Add value
              </Button>
              <Button kind="danger" size="sm" icon={<Trash2 size={11} />} onClick={() => setPlan({ change: changes.dropEnum(current), title: `Drop enum ${current.name}`, danger: true })}>
                Drop enum
              </Button>
            </>
          ) : undefined
        }
      >
        {current && (
          <div className="grid gap-4">
            <KeyList rows={[{ k: "Type", v: `${current.schema}.${current.name}` }, { k: "Values", v: String(current.values.length) }, ...(current.comment ? [{ k: "Comment", v: current.comment }] : [])]} />
            <ol className="grid gap-1">
              {current.values.map((v, i) => (
                <li key={v} className="flex items-center gap-2 rounded-lg border border-hairline bg-bg/40 px-2.5 py-1.5">
                  <span className="w-5 font-mono text-[10px] text-faint tnum">{i + 1}</span>
                  <span className="flex-1 font-mono text-[12px] text-text">{v}</span>
                  <Button kind="ghost" size="sm" icon={<Pencil size={11} />} onClick={() => setEditing({ kind: "rename", enum: current, value: v })}>
                    Rename
                  </Button>
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-dim">PostgreSQL can add and rename values but never removes one: adding a value is an irreversible migration.</p>
          </div>
        )}
      </Sheet>

      <EnumDialog schema={schema} editing={editing} onClose={() => setEditing(null)} onPlan={(p) => { setEditing(null); setPlan(p); }} />
      <PlanDialog open={Boolean(plan)} onOpenChange={(o) => !o && setPlan(null)} change={plan?.change ?? null} name={plan?.name} title={plan?.title} danger={plan?.danger} onApplied={(r) => { if (r.plan.summary.startsWith("Drop")) setOpen(null); }} />
    </Panel>
  );
}

function EnumDialog({ schema, editing, onClose, onPlan }: { schema: string; editing: Editing | null; onClose: () => void; onPlan: (p: PlanState) => void }) {
  const [name, setName] = useState("");
  const [values, setValues] = useState("");
  const [value, setValue] = useState("");
  const [after, setAfter] = useState("");
  const [key, setKey] = useState<Editing | null>(null);
  if (editing !== key) {
    // A new edit: start from clean fields (render-time reset, no effect needed).
    setKey(editing);
    setName("");
    setValues("");
    setValue(editing?.kind === "rename" ? editing.value : "");
    setAfter("");
  }
  const list = values.split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
  const ok = editing?.kind === "new" ? /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && list.length > 0 : editing?.kind === "add" ? value.trim().length > 0 && !editing.enum.values.includes(value.trim()) : editing?.kind === "rename" ? value.trim().length > 0 && value.trim() !== editing.value : false;

  const submit = () => {
    if (!editing) return;
    if (editing.kind === "new") onPlan({ change: changes.createEnum(schema, name.trim(), list), name: `create_enum_${name.trim()}`, title: `Create enum ${name.trim()}` });
    if (editing.kind === "add") onPlan({ change: changes.addEnumValue(editing.enum, value.trim(), after || undefined), name: `add_${value.trim()}_to_${editing.enum.name}`, title: `Add ${value.trim()} to ${editing.enum.name}` });
    if (editing.kind === "rename") onPlan({ change: changes.renameEnumValue(editing.enum, editing.value, value.trim()), name: `rename_${editing.value}_in_${editing.enum.name}`, title: `Rename ${editing.value} in ${editing.enum.name}` });
  };

  return (
    <Dialog
      open={Boolean(editing)}
      onOpenChange={(o) => !o && onClose()}
      title={editing?.kind === "new" ? "New enum" : editing?.kind === "add" ? `Add a value to ${editing.enum.name}` : editing?.kind === "rename" ? `Rename ${editing.value}` : ""}
      description={editing?.kind === "add" ? "Adding a value can't be undone by a migration." : undefined}
      footer={
        <>
          <Button kind="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button kind="primary" size="sm" disabled={!ok} onClick={submit}>
            Plan migration
          </Button>
        </>
      }
    >
      <div className="grid gap-3 pb-1">
        {editing?.kind === "new" && (
          <>
            <Field label="Name" htmlFor="enum-name" hint={`Created as ${schema}.${name || "…"}`}>
              <Input id="enum-name" mono autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="order_status" />
            </Field>
            <Field label="Values" htmlFor="enum-values" hint="One per line or comma-separated, in order">
              <Textarea id="enum-values" mono rows={5} value={values} onChange={(e) => setValues(e.target.value)} placeholder={"pending\npaid\nshipped"} />
            </Field>
          </>
        )}
        {editing?.kind === "add" && (
          <>
            <Field label="Value" htmlFor="enum-value" error={value.trim() && editing.enum.values.includes(value.trim()) ? "already a value" : undefined}>
              <Input id="enum-value" mono autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
            <Field label="After" htmlFor="enum-after" hint="Where in the order; at the end when empty">
              <Select id="enum-after" value={after} onChange={(e) => setAfter(e.target.value)}>
                <option value="">at the end</option>
                {editing.enum.values.map((v) => (
                  <option key={v} value={v}>
                    after {v}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        {editing?.kind === "rename" && (
          <Field label="New value" htmlFor="enum-rename">
            <Input id="enum-rename" mono autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
