"use client";

import { useMemo, useState } from "react";
import { Link2, Plus, X } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Checkbox, Field, Input, Select } from "@gorbital/dash/components/input";
import { Sheet } from "@gorbital/dash/components/sheet";
import { useSchemas, useTypes } from "@/lib/api/db";
import { createTableChanges, defaultTableColumns, emptyColumnForm, validateColumn, type ColumnForm, type FKForm, type TableForm } from "@/lib/table-editor/plan";
import { ColumnFields } from "./column-form";
import { SectionLabel } from "./common";
import { FKPicker, emptyFK } from "./fk-picker";
import { PlanActions, PlanBody, usePlanFlow } from "./plan-preview";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schema: string;
  onCreated: (schema: string, table: string) => void;
};

type TableFK = FKForm & { columns: string[]; id: string };

function validateTable(t: TableForm): string | undefined {
  const name = t.name.trim();
  if (!name) return "needs a name";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name.length > 63) return "letters, digits and underscores, starting with a letter";
  if (!t.columns.length) return "needs at least one column";
  const names = t.columns.map((c) => c.name.trim());
  if (new Set(names).size !== names.length) return "two columns have the same name";
  return undefined;
}

/** The new-table side panel: name, comment, columns, unique constraints, foreign keys, then the plan. */
export function TableSheet({ open, onOpenChange, schema: initialSchema, onCreated }: Props) {
  const schemas = useSchemas(open);
  const [schema, setSchema] = useState(initialSchema);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [columns, setColumns] = useState<ColumnForm[]>(defaultTableColumns);
  const [uniques, setUniques] = useState<string[][]>([]);
  const [fks, setFks] = useState<TableFK[]>([]);
  const types = useTypes(schema ? [schema] : [], open);

  const form: TableForm = useMemo(() => ({ schema, name, comment, columns, uniques, foreignKeys: fks }), [schema, name, comment, columns, uniques, fks]);
  const columnErrors = columns.map(validateColumn);
  const tableError = validateTable(form);
  const valid = !tableError && columnErrors.every((e) => !e);
  const changes = useMemo(() => (valid ? createTableChanges(form) : []), [form, valid]);
  const flow = usePlanFlow(changes, name ? `create_${name}` : undefined, () => onCreated(schema, name.trim()));

  const reset = () => {
    setName("");
    setComment("");
    setColumns(defaultTableColumns());
    setUniques([]);
    setFks([]);
  };
  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v && flow.stage.kind === "done") reset();
  };

  const move = (i: number, d: -1 | 1) => {
    const next = [...columns];
    const [c] = next.splice(i, 1);
    next.splice(i + d, 0, c);
    setColumns(next);
  };
  const columnNames = columns.map((c) => c.name.trim()).filter(Boolean);

  return (
    <Sheet open={open} onOpenChange={close} title="New table" meta={schema} width="xl" description="Columns, constraints and keys become one migration in the app's repository; preview the SQL before it is written." footer={<PlanActions flow={flow} disabled={!valid} applyLabel="Create table" />}>
      <div className="grid gap-5">
        <div className="grid grid-cols-[120px_1fr] gap-3">
          <Field label="Schema">
            <Select value={schema} onChange={(e) => setSchema(e.target.value)} aria-label="Schema">
              {(schemas.data ?? [{ name: schema, system: false }]).filter((s) => !s.system).map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Name" error={name && tableError && !tableError.startsWith("needs at least") && !tableError.startsWith("two") ? tableError : undefined}>
            <Input mono autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="invoices" aria-label="Table name" spellCheck={false} autoComplete="off" />
          </Field>
        </div>
        <Field label="Comment" hint="optional; written as a second migration">
          <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="what the table holds" aria-label="Comment" />
        </Field>

        <div className="grid gap-2">
          <div className="flex items-center">
            <SectionLabel>Columns</SectionLabel>
            <Button size="sm" kind="ghost" icon={<Plus size={11} />} className="ml-auto" onClick={() => setColumns([...columns, emptyColumnForm()])}>
              Add column
            </Button>
          </div>
          {columns.map((c, i) => (
            <ColumnFields
              key={c.id}
              form={c}
              onChange={(next) => setColumns(columns.map((x) => (x.id === c.id ? next : x)))}
              types={types.data}
              mode="create"
              compact
              error={c.name ? columnErrors[i] : undefined}
              onRemove={columns.length > 1 ? () => setColumns(columns.filter((x) => x.id !== c.id)) : undefined}
              onMoveUp={i > 0 ? () => move(i, -1) : undefined}
              onMoveDown={i < columns.length - 1 ? () => move(i, 1) : undefined}
            />
          ))}
          {tableError?.startsWith("two") && <div className="text-[11px] text-danger">{tableError}</div>}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center">
            <SectionLabel>Unique constraints</SectionLabel>
            <Button size="sm" kind="ghost" icon={<Plus size={11} />} className="ml-auto" onClick={() => setUniques([...uniques, []])} disabled={!columnNames.length}>
              Add unique
            </Button>
          </div>
          {uniques.length === 0 && <div className="text-[11.5px] text-dim">Single-column uniqueness is a checkbox on the column; add one here for a combination of columns.</div>}
          {uniques.map((u, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-bg/40 p-2">
              {columnNames.map((n) => (
                <label key={n} className="flex items-center gap-1.5 font-mono text-[11.5px] text-text">
                  <Checkbox checked={u.includes(n)} onCheckedChange={(v) => setUniques(uniques.map((x, j) => (j === i ? (v === true ? [...x, n] : x.filter((y) => y !== n)) : x)))} aria-label={n} />
                  {n}
                </label>
              ))}
              <button type="button" className="ml-auto grid h-6 w-6 place-items-center rounded text-dim hover:bg-danger/10 hover:text-danger" onClick={() => setUniques(uniques.filter((_, j) => j !== i))} aria-label="Remove unique constraint">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center">
            <SectionLabel>Foreign keys</SectionLabel>
            <Button size="sm" kind="ghost" icon={<Link2 size={11} />} className="ml-auto" onClick={() => setFks([...fks, { ...emptyFK(), columns: [], id: `fk${fks.length}_${Date.now()}` }])} disabled={!columnNames.length}>
              Add foreign key
            </Button>
          </div>
          {fks.length === 0 && <div className="text-[11.5px] text-dim">A single column can also reference a table from its own settings (⚙); add one here for a composite key.</div>}
          {fks.map((fk) => (
            <div key={fk.id} className="grid gap-2 rounded-lg border border-hairline bg-bg/40 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <SectionLabel>Columns</SectionLabel>
                {columnNames.map((n) => (
                  <label key={n} className="flex items-center gap-1.5 font-mono text-[11.5px] text-text">
                    <Checkbox checked={fk.columns.includes(n)} onCheckedChange={(v) => setFks(fks.map((x) => (x.id === fk.id ? { ...x, columns: v === true ? [...x.columns, n] : x.columns.filter((y) => y !== n), ref_columns: [] } : x)))} aria-label={n} />
                    {n}
                  </label>
                ))}
                <button type="button" className="ml-auto grid h-6 w-6 place-items-center rounded text-dim hover:bg-danger/10 hover:text-danger" onClick={() => setFks(fks.filter((x) => x.id !== fk.id))} aria-label="Remove foreign key">
                  <X size={13} />
                </button>
              </div>
              <FKPicker value={fk} onChange={(next) => setFks(fks.map((x) => (x.id === fk.id ? { ...x, ...next } : x)))} localColumns={fk.columns} />
            </div>
          ))}
        </div>

        <PlanBody flow={flow} />
      </div>
    </Sheet>
  );
}
