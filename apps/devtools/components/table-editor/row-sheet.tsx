"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@gorbital/dash/components/button";
import { Field } from "@gorbital/dash/components/input";
import { Sheet } from "@gorbital/dash/components/sheet";
import type { Cell, Column, RowKey } from "@/lib/api/db";
import { useInsertRow, useUpdateRow } from "@/lib/api/db";
import { cellKind, defaultPlaceholder, fromEditor, toEditor } from "@/lib/table-editor/literals";
import { ProblemNote, TypeBadge } from "./common";
import { ValueInput, emptyFor, jsonError, type ValueState } from "./value-input";

export type RowSheetMode = { kind: "insert" } | { kind: "duplicate"; row: Cell[] } | { kind: "edit"; row: Cell[]; key: RowKey };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schema: string;
  table: string;
  columns: Column[];
  primaryKey: string[];
  mode: RowSheetMode;
  onSaved: () => void;
};

/** One field per column: insert a row, duplicate one, or edit one whole. */
export function RowSheet({ open, onOpenChange, schema, table, columns, primaryKey, mode, onSaved }: Props) {
  const insert = useInsertRow(schema, table);
  const update = useUpdateRow(schema, table);
  const [values, setValues] = useState<Record<string, ValueState>>({});
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    if (!open) return;
    setError(undefined);
    const next: Record<string, ValueState> = {};
    columns.forEach((c, i) => {
      if (mode.kind === "insert") {
        // A required column without a default starts empty; the rest is left to the database.
        next[c.name] = c.default_expr === null && c.identity === "" && c.generated === "" && !c.is_nullable ? emptyFor(c) : undefined;
      } else if (mode.kind === "duplicate") {
        // Generated values and keyed defaults are left to the database; the rest is copied.
        const generated = c.identity !== "" || c.generated !== "" || (c.is_primary_key && c.default_expr !== null);
        next[c.name] = generated ? undefined : toEditor(c, mode.row[i]);
      } else {
        next[c.name] = c.generated !== "" ? undefined : toEditor(c, mode.row[i]);
      }
    });
    setValues(next);
  }, [open, mode, columns]);

  const errors = useMemo(() => Object.fromEntries(columns.filter((c) => cellKind(c) === "json" && !c.is_array).map((c) => [c.name, jsonError(values[c.name])])), [columns, values]);
  const invalid = Object.values(errors).some(Boolean);
  const saving = insert.isPending || update.isPending;

  const save = async () => {
    setError(undefined);
    const out: Record<string, Cell> = {};
    for (const c of columns) {
      const v = values[c.name];
      if (v === undefined) continue;
      if (mode.kind === "edit" && fromEditor(c, v) === mode.row[columns.indexOf(c)]) continue;
      out[c.name] = fromEditor(c, v);
    }
    try {
      if (mode.kind === "edit") {
        if (!Object.keys(out).length) return onOpenChange(false);
        await update.mutateAsync({ key: mode.key, values: out });
      } else {
        await insert.mutateAsync(out);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err);
    }
  };

  const title = mode.kind === "insert" ? "Insert row" : mode.kind === "duplicate" ? "Duplicate row" : "Edit row";
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      meta={`${schema}.${table}`}
      width="md"
      description={mode.kind === "edit" ? `row ${primaryKey.map((k) => `${k} = ${mode.key[k] ?? "NULL"}`).join(", ")}` : "Values are text as PostgreSQL reads them; leave a field on its default to let the database fill it."}
      footer={
        <>
          <Button size="sm" kind="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" kind="primary" onClick={() => void save()} loading={saving} disabled={invalid}>
            {mode.kind === "edit" ? "Save row" : "Insert row"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error !== undefined && <ProblemNote error={error} />}
        {columns.map((c) => {
          const locked = c.identity === "a" || c.generated !== "";
          return (
            <Field
              key={c.name}
              label={
                <span className="flex items-center gap-1.5 normal-case tracking-normal">
                  <span className="font-mono text-[11.5px] text-text">{c.name}</span>
                  {!c.is_nullable && <span className="text-dim">*</span>}
                  <TypeBadge column={c} />
                  {c.is_primary_key && <span className="text-[10px] uppercase tracking-wider text-warn">pk</span>}
                </span>
              }
              htmlFor={`row-${c.name}`}
              hint={locked ? (c.identity === "a" ? "identity: always generated" : c.generation_expr ? `generated: ${c.generation_expr}` : undefined) : c.comment ?? (defaultPlaceholder(c) ? `default ${defaultPlaceholder(c)}` : undefined)}
              error={errors[c.name]}
            >
              <ValueInput id={`row-${c.name}`} column={c} value={locked ? undefined : values[c.name]} onChange={(v) => setValues((s) => ({ ...s, [c.name]: v }))} allowDefault={mode.kind !== "edit"} disabled={locked} />
            </Field>
          );
        })}
      </div>
    </Sheet>
  );
}
