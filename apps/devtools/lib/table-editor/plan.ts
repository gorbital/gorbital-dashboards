/**
 * From the column and table forms to the `Change` a plan request carries
 * (pgmeta/ddl.go). A form holds strings and booleans; a spec leaves out what
 * the form didn't set, so an alteration only touches what changed.
 */
import type { Change, Column, ColumnSpec, FKAction, FKSpec, Identity } from "../api/db";

export type FKForm = {
  ref_schema: string;
  ref_table: string;
  ref_columns: string[];
  on_delete: FKAction;
  on_update: FKAction;
};

export type ColumnForm = {
  /** A client-side key for lists. */
  id: string;
  name: string;
  /** A picker name (int8, text, numeric(10,2), varchar(100)) or schema.enum. */
  type: string;
  array: boolean;
  nullable: boolean;
  /** Empty means no default. */
  default: string;
  defaultIsExpr: boolean;
  identity: Identity;
  primaryKey: boolean;
  unique: boolean;
  check: string;
  comment: string;
  references?: FKForm;
};

export const integerTypes = ["int2", "int4", "int8"];

export const fkActions: FKAction[] = ["NO ACTION", "RESTRICT", "CASCADE", "SET NULL", "SET DEFAULT"];

let seq = 0;
export const nextId = () => `c${++seq}_${Date.now().toString(36)}`;

export function emptyColumnForm(patch: Partial<ColumnForm> = {}): ColumnForm {
  return {
    id: nextId(),
    name: "",
    type: "text",
    array: false,
    nullable: true,
    default: "",
    defaultIsExpr: false,
    identity: "none",
    primaryKey: false,
    unique: false,
    check: "",
    comment: "",
    ...patch,
  };
}

/** The columns a new table starts with: an identity primary key and a creation time. */
export function defaultTableColumns(): ColumnForm[] {
  return [
    emptyColumnForm({ name: "id", type: "int8", nullable: false, identity: "by_default", primaryKey: true }),
    emptyColumnForm({ name: "created_at", type: "timestamptz", nullable: false, default: "now()", defaultIsExpr: true }),
  ];
}

const pickerNames = new Set(["int2", "int4", "int8", "float4", "float8", "numeric", "json", "jsonb", "text", "varchar", "uuid", "date", "time", "timetz", "timestamp", "timestamptz", "bool", "bytea"]);

/** The picker name for an existing column: `int8`, `varchar(100)`, `numeric(10,2)`, `public.status`. */
export function pickerTypeOf(col: Pick<Column, "type_name" | "type_schema" | "data_type" | "is_array" | "enum_values">): string {
  const base = col.is_array && col.type_name.startsWith("_") ? col.type_name.slice(1) : col.type_name;
  const sized = /^(numeric|character varying|decimal)\((\d+(?:,\s*\d+)?)\)/.exec(col.data_type);
  if (sized) return `${sized[1] === "character varying" ? "varchar" : sized[1]}(${sized[2].replace(/\s/g, "")})`;
  if (col.enum_values?.length || (!pickerNames.has(base) && col.type_schema !== "pg_catalog")) return `${col.type_schema}.${base}`;
  return base;
}

const identityOf: Record<Column["identity"], Identity> = { "": "none", a: "always", d: "by_default" };

export function columnFormFromColumn(col: Column): ColumnForm {
  return {
    id: nextId(),
    name: col.name,
    type: pickerTypeOf(col),
    array: col.is_array,
    nullable: col.is_nullable,
    default: col.default_expr ?? "",
    defaultIsExpr: true,
    identity: identityOf[col.identity] ?? "none",
    primaryKey: col.is_primary_key,
    unique: col.is_unique && !col.is_primary_key,
    check: "",
    comment: col.comment ?? "",
  };
}

export function fkSpec(columns: string[], fk: FKForm, name?: string): FKSpec {
  const spec: FKSpec = { columns, ref_schema: fk.ref_schema, ref_table: fk.ref_table, ref_columns: fk.ref_columns };
  if (name) spec.name = name;
  if (fk.on_delete && fk.on_delete !== "NO ACTION") spec.on_delete = fk.on_delete;
  if (fk.on_update && fk.on_update !== "NO ACTION") spec.on_update = fk.on_update;
  return spec;
}

/** A column to create (create_table, add_column): every set field. */
export function columnSpecFromForm(f: ColumnForm): ColumnSpec {
  const spec: ColumnSpec = { name: f.name.trim(), type: f.type.trim() };
  if (f.array) spec.array = true;
  if (!f.primaryKey) spec.nullable = f.nullable;
  if (f.default.trim() !== "") {
    spec.default = f.default.trim();
    if (f.defaultIsExpr) spec.default_is_expr = true;
  }
  if (f.identity !== "none" && integerTypes.includes(f.type)) spec.identity = f.identity;
  if (f.primaryKey) spec.primary_key = true;
  if (f.unique && !f.primaryKey) spec.unique = true;
  if (f.check.trim()) spec.check = f.check.trim();
  if (f.comment.trim()) spec.comment = f.comment.trim();
  if (f.references && f.references.ref_table && f.references.ref_columns.length === 1) spec.references = fkSpec([spec.name], f.references);
  return spec;
}

export type TableForm = {
  schema: string;
  name: string;
  comment: string;
  columns: ColumnForm[];
  uniques: string[][];
  foreignKeys: (FKForm & { columns: string[] })[];
};

export function createTableChange(t: TableForm): Change {
  const change: Change = { kind: "create_table", schema: t.schema, table: t.name.trim(), columns: t.columns.map(columnSpecFromForm) };
  const uniques = t.uniques.filter((u) => u.length > 0);
  if (uniques.length) change.uniques = uniques;
  const fks = t.foreignKeys.filter((fk) => fk.columns.length && fk.ref_table);
  if (fks.length) change.foreign_keys = fks.map((fk) => fkSpec(fk.columns, fk));
  return change;
}

/** The changes that create a table: the table, then its comment when there is one. */
export function createTableChanges(t: TableForm): Change[] {
  const out = [createTableChange(t)];
  if (t.comment.trim()) out.push({ kind: "comment", schema: t.schema, table: t.name.trim(), comment: t.comment.trim() });
  return out;
}

export function addColumnChange(schema: string, table: string, f: ColumnForm): Change {
  return { kind: "add_column", schema, table, column: columnSpecFromForm(f) };
}

/**
 * Editing an existing column: one alter_column carrying only what changed
 * (against the current name, so it plans against today's catalog), an
 * add_check when a check was written, and the rename last. Empty when
 * nothing changed.
 */
export function editColumnChanges(schema: string, table: string, current: Column, f: ColumnForm, initial: ColumnForm = columnFormFromColumn(current)): Change[] {
  const out: Change[] = [];
  const oldName = current.name;
  const newName = f.name.trim();
  const target: ColumnSpec = { name: oldName, type: "" };
  let touched = false;
  if (f.nullable !== initial.nullable) {
    target.nullable = f.nullable;
    touched = true;
  }
  if (f.type !== initial.type || f.array !== initial.array) {
    target.type = f.type.trim();
    if (f.array) target.array = true;
    touched = true;
  }
  if (f.default.trim() !== initial.default.trim() || (f.default.trim() !== "" && f.defaultIsExpr !== initial.defaultIsExpr)) {
    // An empty expression default means DROP DEFAULT.
    target.default = f.default.trim();
    target.default_is_expr = f.default.trim() === "" ? true : f.defaultIsExpr;
    touched = true;
  }
  if (f.identity !== initial.identity) {
    target.identity = f.identity;
    touched = true;
  }
  if (f.unique && !initial.unique) {
    target.unique = true;
    touched = true;
  }
  if (f.comment.trim() !== initial.comment.trim() && f.comment.trim() !== "") {
    target.comment = f.comment.trim();
    touched = true;
  }
  if (touched) out.push({ kind: "alter_column", schema, table, column: target });
  if (f.check.trim()) out.push({ kind: "add_check", schema, table, check: f.check.trim() });
  if (newName && newName !== oldName) out.push({ kind: "rename_column", schema, table, column: { name: oldName, type: "" }, new_name: newName });
  return out;
}

export function dropColumnChange(schema: string, table: string, name: string, cascade = false): Change {
  const change: Change = { kind: "drop_column", schema, table, column: { name, type: "" } };
  if (cascade) change.cascade = true;
  return change;
}

export function addForeignKeyChange(schema: string, table: string, columns: string[], fk: FKForm): Change {
  return { kind: "add_foreign_key", schema, table, foreign_key: fkSpec(columns, fk) };
}

export function addUniqueChange(schema: string, table: string, columns: string[]): Change {
  return { kind: "add_unique", schema, table, unique: columns };
}

export function setPrimaryKeyChange(schema: string, table: string, columns: string[]): Change {
  return { kind: "set_primary_key", schema, table, primary_key: columns };
}

/** What's wrong with a column form, or nothing. */
export function validateColumn(f: ColumnForm): string | undefined {
  const name = f.name.trim();
  if (!name) return "needs a name";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name.length > 63) return "letters, digits and underscores, starting with a letter";
  if (!f.type.trim()) return "needs a type";
  if (f.identity !== "none" && !integerTypes.includes(f.type)) return "identity needs an integer type";
  return undefined;
}
