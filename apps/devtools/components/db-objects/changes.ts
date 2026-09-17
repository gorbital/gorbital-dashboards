/**
 * The `Change` objects the Objects page sends to `POST db/ddl/plan` and
 * `apply`, one builder per action, plus the templates the New sheets start
 * from. Pure, so the request shapes are unit tested against ddl.go's
 * expectations (which fields each kind reads, the signature format).
 */
import type { Change, DbEnum, DbFunction, DbTrigger, DbView, IndexSpec } from "@/lib/api/schema";

/** `name(argument types)`, what DROP FUNCTION needs, from the catalog's identity_args. */
export function signatureOf(fn: Pick<DbFunction, "name" | "identity_args">): string {
  return `${fn.name}(${fn.identity_args})`;
}

/**
 * The signature a `CREATE FUNCTION` statement declares: the name and the
 * argument list as written, without defaults. Null when the statement
 * doesn't parse; the user can still type the signature by hand.
 */
export function signatureFromDefinition(definition: string): string | null {
  const m = /create\s+(?:or\s+replace\s+)?(?:function|procedure)\s+(?:"?[\w]+"?\.)?"?([\w]+)"?\s*\(([^)]*)\)/i.exec(definition);
  if (!m) return null;
  const args = m[2]
    .split(",")
    .map((a) => a.replace(/\s+(default|=)\s+.*$/i, "").trim())
    .filter(Boolean)
    .join(", ");
  return `${m[1]}(${args})`;
}

/** The name declared by a CREATE TRIGGER / CREATE FUNCTION statement, for the change's `name`. */
export function nameFromDefinition(definition: string, kind: "trigger" | "function"): string | null {
  const re = kind === "trigger" ? /create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+"?([\w]+)"?/i : /create\s+(?:or\s+replace\s+)?(?:function|procedure)\s+(?:"?[\w]+"?\.)?"?([\w]+)"?/i;
  return re.exec(definition)?.[1] ?? null;
}

export const changes = {
  createExtension: (name: string): Change => ({ kind: "create_extension", schema: "public", name }),
  dropExtension: (name: string): Change => ({ kind: "drop_extension", schema: "public", name }),

  createFunction: (schema: string, name: string, signature: string, definition: string): Change => ({ kind: "create_function", schema, name, signature, definition }),
  /** Passes the catalog's definition so the Down recreates the function. */
  dropFunction: (fn: DbFunction): Change => ({ kind: "drop_function", schema: fn.schema, signature: signatureOf(fn), definition: fn.definition ?? undefined }),

  createTrigger: (schema: string, table: string, name: string, definition: string): Change => ({ kind: "create_trigger", schema, table, name, definition }),
  dropTrigger: (schema: string, table: string, trigger: DbTrigger): Change => ({ kind: "drop_trigger", schema, table, name: trigger.name, definition: trigger.definition }),

  createEnum: (schema: string, name: string, values: string[]): Change => ({ kind: "create_enum", schema, name, values }),
  addEnumValue: (e: Pick<DbEnum, "schema" | "name">, value: string, after?: string): Change => ({ kind: "add_enum_value", schema: e.schema, name: e.name, value, ...(after ? { after } : {}) }),
  renameEnumValue: (e: Pick<DbEnum, "schema" | "name">, value: string, newName: string): Change => ({ kind: "rename_enum_value", schema: e.schema, name: e.name, value, new_name: newName }),
  dropEnum: (e: Pick<DbEnum, "schema" | "name">): Change => ({ kind: "drop_enum", schema: e.schema, name: e.name }),

  createIndex: (schema: string, table: string, index: IndexSpec): Change => ({ kind: "create_index", schema, table, index: compactIndex(index) }),
  dropIndex: (schema: string, table: string, indexName: string): Change => ({ kind: "drop_index", schema, table, index_name: indexName }),

  createView: (schema: string, name: string, definition: string, materialized: boolean): Change => ({ kind: "create_view", schema, name, definition, materialized }),
  /** Passes the catalog's SELECT so the Down recreates the view. */
  dropView: (v: DbView): Change => ({ kind: "drop_view", schema: v.schema, name: v.name, definition: v.definition, materialized: v.is_materialized }),
};

/** Drops the empty optional fields so the request carries only what ddl.go reads. */
function compactIndex(i: IndexSpec): IndexSpec {
  const out: IndexSpec = { columns: i.columns.map((c) => c.trim()).filter(Boolean) };
  if (i.name?.trim()) out.name = i.name.trim();
  if (i.unique) out.unique = true;
  if (i.method?.trim()) out.method = i.method.trim().toLowerCase();
  if (i.where?.trim()) out.where = i.where.trim();
  if (i.concurrently) out.concurrently = true;
  return out;
}

/* ---------- Templates ---------- */

export function functionTemplate(schema: string, name = "my_function"): string {
  return `CREATE OR REPLACE FUNCTION ${schema}.${name}(arg integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT arg + 1;
$$;`;
}

export function triggerFunctionTemplate(schema: string, name = "set_updated_at"): string {
  return `CREATE OR REPLACE FUNCTION ${schema}.${name}()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;`;
}

export function triggerTemplate(schema: string, table: string, name?: string, fn = "set_updated_at"): string {
  return `CREATE TRIGGER ${name ?? `${table}_${fn}`}
BEFORE UPDATE ON ${schema}.${table}
FOR EACH ROW
EXECUTE FUNCTION ${schema}.${fn}();`;
}

export function viewTemplate(schema: string, table?: string): string {
  return `SELECT *\nFROM ${schema}.${table ?? "some_table"}\nWHERE true`;
}
