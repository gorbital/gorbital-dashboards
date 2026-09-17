"use client";

import { Field, Select } from "@gorbital/dash/components/input";
import { useSchemas, useTableDetail, useTables, type FKAction } from "@/lib/api/db";
import { fkActions, type FKForm } from "@/lib/table-editor/plan";

type Props = {
  value: FKForm;
  onChange: (v: FKForm) => void;
  /** How many local columns the key has; one select per referenced column. */
  localColumns: string[];
  disabled?: boolean;
};

export const emptyFK = (): FKForm => ({ ref_schema: "public", ref_table: "", ref_columns: [], on_delete: "NO ACTION", on_update: "NO ACTION" });

/** Schema → table → column(s) from the catalog, and what happens on delete and update. */
export function FKPicker({ value, onChange, localColumns, disabled }: Props) {
  const schemas = useSchemas();
  const tables = useTables(value.ref_schema ? [value.ref_schema] : [], Boolean(value.ref_schema));
  const detail = useTableDetail(value.ref_schema || undefined, value.ref_table || undefined);
  const refColumns = detail.data?.columns ?? [];
  const keyish = refColumns.filter((c) => c.is_primary_key || c.is_unique);
  const candidates = keyish.length ? keyish : refColumns;
  const n = Math.max(1, localColumns.length);

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Schema">
          <Select value={value.ref_schema} onChange={(e) => onChange({ ...value, ref_schema: e.target.value, ref_table: "", ref_columns: [] })} disabled={disabled} aria-label="Referenced schema">
            {(schemas.data ?? [{ name: value.ref_schema || "public" }]).filter((s) => !("system" in s) || !s.system).map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Table" hint={tables.error ? "couldn't list tables" : undefined}>
          <Select value={value.ref_table} onChange={(e) => onChange({ ...value, ref_table: e.target.value, ref_columns: [] })} disabled={disabled || !tables.data} aria-label="Referenced table">
            <option value="">{tables.isPending ? "loading…" : "choose a table"}</option>
            {(tables.data ?? [])
              .filter((t) => t.kind === "table" || t.kind === "partitioned_table")
              .map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
          </Select>
        </Field>
      </div>
      {value.ref_table && (
        <div className="grid gap-2">
          {Array.from({ length: n }, (_, i) => (
            <Field key={i} label={localColumns[i] ? `${localColumns[i]} → column` : "Referenced column"} hint={i === 0 && keyish.length === 0 && refColumns.length > 0 ? "the referenced columns should be unique or the primary key" : undefined}>
              <Select
                value={value.ref_columns[i] ?? ""}
                onChange={(e) => {
                  const next = [...value.ref_columns];
                  next[i] = e.target.value;
                  onChange({ ...value, ref_columns: next.slice(0, n) });
                }}
                disabled={disabled || detail.isPending}
                aria-label="Referenced column"
              >
                <option value="">{detail.isPending ? "loading…" : "choose a column"}</option>
                {candidates.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} · {c.data_type}
                    {c.is_primary_key ? " · pk" : c.is_unique ? " · unique" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="On delete">
          <Select value={value.on_delete} onChange={(e) => onChange({ ...value, on_delete: e.target.value as FKAction })} disabled={disabled} aria-label="On delete">
            {fkActions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="On update">
          <Select value={value.on_update} onChange={(e) => onChange({ ...value, on_update: e.target.value as FKAction })} disabled={disabled} aria-label="On update">
            {fkActions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </div>
  );
}
