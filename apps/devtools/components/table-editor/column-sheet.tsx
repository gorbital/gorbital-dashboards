"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@gorbital/dash/components/sheet";
import { useTypes, type Column } from "@/lib/api/db";
import { addColumnChange, columnFormFromColumn, editColumnChanges, emptyColumnForm, validateColumn, type ColumnForm } from "@/lib/table-editor/plan";
import { ColumnFields } from "./column-form";
import { PlanActions, PlanBody, usePlanFlow } from "./plan-preview";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schema: string;
  table: string;
  /** The column to edit; none adds one. */
  column?: Column;
  onApplied?: () => void;
};

/** Add a column, or change one: the same fields, one migration (two when the column is renamed). */
export function ColumnSheet({ open, onOpenChange, schema, table, column, onApplied }: Props) {
  const types = useTypes([schema], open);
  const [initial, setInitial] = useState<ColumnForm>(() => (column ? columnFormFromColumn(column) : emptyColumnForm()));
  const [form, setForm] = useState<ColumnForm>(initial);

  useEffect(() => {
    if (!open) return;
    const f = column ? columnFormFromColumn(column) : emptyColumnForm();
    setInitial(f);
    setForm(f);
  }, [open, column]);

  const error = validateColumn(form);
  const changes = useMemo(() => {
    if (error) return [];
    return column ? editColumnChanges(schema, table, column, form, initial) : [addColumnChange(schema, table, form)];
  }, [error, column, schema, table, form, initial]);
  const flow = usePlanFlow(changes, `${column ? "change" : "add"}_${form.name.trim() || "column"}_${column ? "in" : "to"}_${table}`, onApplied);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={column ? `Edit ${column.name}` : "Add column"}
      meta={`${schema}.${table}`}
      width="md"
      description={column ? "Only what you change goes into the migration; a rename becomes a second one." : "The column becomes one migration in the app's repository."}
      footer={<PlanActions flow={flow} disabled={Boolean(error) || (Boolean(column) && changes.length === 0)} applyLabel={column ? "Apply changes" : "Add column"} />}
    >
      <div className="grid gap-5">
        <ColumnFields form={form} onChange={setForm} types={types.data} mode={column ? "edit" : "create"} error={form.name ? error : undefined} />
        {column && changes.length === 0 && !error && <div className="text-[11.5px] text-dim">Nothing changed yet.</div>}
        <PlanBody flow={flow} />
      </div>
    </Sheet>
  );
}
