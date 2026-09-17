"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Dialog } from "@gorbital/dash/components/dialog";
import { Button } from "@gorbital/dash/components/button";
import { Checkbox } from "@gorbital/dash/components/input";
import type { Change, Column } from "@/lib/api/db";
import { addForeignKeyChange, addUniqueChange, dropColumnChange, setPrimaryKeyChange, type FKForm } from "@/lib/table-editor/plan";
import { FKPicker, emptyFK } from "./fk-picker";
import { PlanActions, PlanBody, usePlanFlow } from "./plan-preview";

export type DDLIntent =
  | { kind: "drop_column"; column: Column }
  | { kind: "foreign_key"; column: Column }
  | { kind: "unique"; column: Column }
  | { kind: "primary_key"; column: Column }
  | { kind: "drop_table" }
  | { kind: "rename_table" };

type Props = {
  intent: DDLIntent | null;
  onClose: () => void;
  schema: string;
  table: string;
  columns: Column[];
  onApplied: (intent: DDLIntent) => void;
};

/** One-off schema changes from a menu: a short form (when needed), the plan, Apply. */
export function DDLDialog({ intent, onClose, schema, table, columns, onApplied }: Props) {
  const [fk, setFk] = useState<FKForm>(emptyFK);
  const [cascade, setCascade] = useState(false);
  const [newName, setNewName] = useState("");
  const [pkColumns, setPkColumns] = useState<string[]>([]);

  const changes: Change[] = useMemo(() => {
    if (!intent) return [];
    switch (intent.kind) {
      case "drop_column":
        return [dropColumnChange(schema, table, intent.column.name, cascade)];
      case "foreign_key":
        return fk.ref_table && fk.ref_columns.length === 1 && fk.ref_columns[0] ? [addForeignKeyChange(schema, table, [intent.column.name], fk)] : [];
      case "unique":
        return [addUniqueChange(schema, table, [intent.column.name])];
      case "primary_key": {
        const cols = pkColumns.length ? pkColumns : [intent.column.name];
        return [setPrimaryKeyChange(schema, table, cols)];
      }
      case "drop_table":
        return [{ kind: "drop_table", schema, table, cascade: cascade || undefined }];
      case "rename_table":
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(newName.trim()) ? [{ kind: "rename_table", schema, table, new_name: newName.trim() }] : [];
    }
  }, [intent, schema, table, cascade, fk, pkColumns, newName]);

  const flow = usePlanFlow(changes, undefined, () => intent && onApplied(intent));
  if (!intent) return null;

  const titles: Record<DDLIntent["kind"], string> = {
    drop_column: `Delete column ${"column" in intent ? intent.column.name : ""}`,
    foreign_key: `Foreign key on ${"column" in intent ? intent.column.name : ""}`,
    unique: `Make ${"column" in intent ? intent.column.name : ""} unique`,
    primary_key: "Set the primary key",
    drop_table: `Delete table ${table}`,
    rename_table: `Rename ${table}`,
  };
  const danger = intent.kind === "drop_column" || intent.kind === "drop_table";

  let body: ReactNode = null;
  if (intent.kind === "drop_column" || intent.kind === "drop_table") {
    body = (
      <div className="grid gap-2">
        <p className="text-muted">{intent.kind === "drop_column" ? "The column and every value in it are dropped. The migration's Down can't bring the values back." : "The table and every row in it are dropped. The migration's Down can't bring the rows back."}</p>
        <label className="flex items-center gap-2 text-[11.5px] text-text">
          <Checkbox checked={cascade} onCheckedChange={(v) => setCascade(v === true)} aria-label="Cascade" />
          cascade to what depends on it (views, foreign keys)
        </label>
      </div>
    );
  } else if (intent.kind === "foreign_key") {
    body = <FKPicker value={fk} onChange={setFk} localColumns={[intent.column.name]} />;
  } else if (intent.kind === "primary_key") {
    const chosen = pkColumns.length ? pkColumns : [intent.column.name];
    body = (
      <div className="grid gap-2">
        <p className="text-muted">Replaces the current primary key, if any. Every chosen column must be NOT NULL and the combination unique.</p>
        <div className="flex flex-wrap gap-3">
          {columns.map((c) => (
            <label key={c.name} className="flex items-center gap-1.5 font-mono text-[11.5px] text-text">
              <Checkbox checked={chosen.includes(c.name)} onCheckedChange={(v) => setPkColumns(v === true ? [...chosen, c.name] : chosen.filter((x) => x !== c.name))} aria-label={c.name} />
              {c.name}
            </label>
          ))}
        </div>
      </div>
    );
  } else if (intent.kind === "rename_table") {
    body = (
      <input
        autoFocus
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        placeholder="new_name"
        aria-label="New name"
        className="h-8 w-full rounded-lg border border-border bg-code-bg px-2.5 font-mono text-[12px] text-text outline-none focus:border-primary/50"
        spellCheck={false}
      />
    );
  } else if (intent.kind === "unique") {
    body = <p className="text-muted">Adds a unique constraint on the column; existing duplicate values make the migration fail.</p>;
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={titles[intent.kind]}
      description={`${schema}.${table}`}
      size="lg"
      footer={
        <>
          <Button size="sm" kind="ghost" onClick={onClose}>
            {flow.stage.kind === "done" ? "Close" : "Cancel"}
          </Button>
          <PlanActions flow={flow} disabled={!changes.length} applyLabel={danger ? "Apply and drop" : "Apply"} danger={danger} />
        </>
      }
    >
      <div className="grid gap-4">
        {body}
        <PlanBody flow={flow} />
      </div>
    </Dialog>
  );
}
