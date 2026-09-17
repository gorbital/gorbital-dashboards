/**
 * An in-memory PostgreSQL for mock mode: a few tables with rows, answered
 * through the same `/_portal/api/db/*` endpoints as `orb dev` (filters,
 * sorts, pages, inserts, updates, deletes, imports) and a DDL planner that
 * renders plausible SQL and applies it to the catalog in memory. Everything
 * speaks in text literals, like the real thing.
 */
import { rng, NOW } from "@gorbital/dash/lib/rand";
import type {
  Cell,
  Change,
  Column,
  ColumnSpec,
  Constraint,
  DDLPlan,
  DDLRequest,
  DDLResponse,
  Enum,
  FKSpec,
  Filter,
  ImportRequest,
  Index,
  RowEdit,
  RowKey,
  RowPage,
  RowQuery,
  Schema,
  Sort,
  Table,
  TableDetail,
  Trigger,
  TypeOption,
  View,
} from "../db";
import type { Problem } from "../types";

/* ---------- Shapes ---------- */

type MockTable = {
  table: Table;
  columns: Column[];
  constraints: Constraint[];
  indexes: Index[];
  triggers: Trigger[];
  rows: Record<string, Cell>[];
  /** The next identity value. */
  seq: number;
  /** A view's SELECT. */
  definition?: string;
};

const dataTypes: Record<string, string> = {
  int2: "smallint",
  int4: "integer",
  int8: "bigint",
  float4: "real",
  float8: "double precision",
  numeric: "numeric",
  json: "json",
  jsonb: "jsonb",
  text: "text",
  varchar: "character varying",
  uuid: "uuid",
  date: "date",
  time: "time without time zone",
  timetz: "time with time zone",
  timestamp: "timestamp without time zone",
  timestamptz: "timestamp with time zone",
  bool: "boolean",
  bytea: "bytea",
};

const enums: Enum[] = [{ id: 20001, schema: "public", name: "project_status", values: ["draft", "active", "archived"], comment: "Where a project is in its life" }];

type ColOpts = Partial<Pick<Column, "is_nullable" | "default_expr" | "identity" | "comment" | "is_primary_key" | "is_unique" | "fk_targets" | "is_array" | "generation_expr" | "generated">>;

let nextOid = 16400;

function col(ordinal: number, name: string, type: string, opts: ColOpts = {}): Column {
  const isEnum = enums.some((e) => e.name === type);
  const isArray = opts.is_array ?? false;
  const dt = isEnum ? type : dataTypes[type] ?? type;
  return {
    ordinal,
    name,
    data_type: isArray ? `${dt}[]` : dt,
    type_name: isArray ? `_${type}` : type,
    type_schema: isEnum ? "public" : "pg_catalog",
    is_array: isArray,
    enum_values: isEnum ? enums.find((e) => e.name === type)?.values : undefined,
    is_nullable: opts.is_nullable ?? !opts.is_primary_key,
    default_expr: opts.default_expr ?? null,
    generation_expr: opts.generation_expr ?? null,
    identity: opts.identity ?? "",
    generated: opts.generated ?? "",
    comment: opts.comment ?? null,
    is_primary_key: opts.is_primary_key ?? false,
    is_unique: opts.is_unique ?? opts.is_primary_key ?? false,
    fk_targets: opts.fk_targets,
  };
}

function table(schema: string, name: string, kind: Table["kind"], ownership: Table["ownership"], comment: string | null, rows: number, sizeKb: number): Table {
  return {
    id: nextOid++,
    schema,
    name,
    kind,
    is_partition: false,
    rls_enabled: false,
    rls_forced: false,
    row_estimate: rows,
    live_rows: rows,
    bytes: sizeKb * 1024,
    size: `${sizeKb} kB`,
    comment,
    owner: "acme",
    from_extension: false,
    ownership,
  };
}

function pk(t: string, columns: string[]): Constraint {
  return { id: nextOid++, name: `${t}_pkey`, type: "p", definition: `PRIMARY KEY (${columns.join(", ")})`, deferrable: false, deferred: false, validated: true, columns, ref_schema: null, ref_table: null, on_delete: null, on_update: null };
}

function fk(t: string, columns: string[], refSchema: string, refTable: string, refColumns: string[], onDelete = "CASCADE"): Constraint {
  return {
    id: nextOid++,
    name: `${t}_${columns.join("_")}_fkey`,
    type: "f",
    definition: `FOREIGN KEY (${columns.join(", ")}) REFERENCES ${refSchema === "public" ? "" : refSchema + "."}${refTable}(${refColumns.join(", ")})${onDelete !== "NO ACTION" ? ` ON DELETE ${onDelete}` : ""}`,
    deferrable: false,
    deferred: false,
    validated: true,
    columns,
    ref_schema: refSchema,
    ref_table: refTable,
    ref_columns: refColumns,
    on_delete: onDelete,
    on_update: "NO ACTION",
  };
}

function check(t: string, column: string, expr: string): Constraint {
  return { id: nextOid++, name: `${t}_${column}_check`, type: "c", definition: `CHECK (${expr})`, deferrable: false, deferred: false, validated: true, columns: [column], ref_schema: null, ref_table: null, on_delete: null, on_update: null };
}

function unique(t: string, columns: string[]): Constraint {
  return { id: nextOid++, name: `${t}_${columns.join("_")}_key`, type: "u", definition: `UNIQUE (${columns.join(", ")})`, deferrable: false, deferred: false, validated: true, columns, ref_schema: null, ref_table: null, on_delete: null, on_update: null };
}

function index(schema: string, t: string, columns: string[], opts: { unique?: boolean; primary?: boolean; method?: string; scans?: number } = {}): Index {
  const name = opts.primary ? `${t}_pkey` : `${t}_${columns.join("_")}_${opts.unique ? "key" : "idx"}`;
  const method = opts.method ?? "btree";
  return {
    id: nextOid++,
    name,
    definition: `CREATE ${opts.unique || opts.primary ? "UNIQUE " : ""}INDEX ${name} ON ${schema}.${t} USING ${method} (${columns.join(", ")})`,
    method,
    is_unique: Boolean(opts.unique || opts.primary),
    is_primary: Boolean(opts.primary),
    is_valid: true,
    is_partial: false,
    columns,
    bytes: 16384,
    scans: opts.scans ?? 0,
    last_scan: opts.scans ? new Date(NOW - 3 * 60_000).toISOString() : null,
  };
}

/* ---------- Sample data ---------- */

const r = rng(4242);

function ts(offsetMs: number): string {
  const d = new Date(NOW - offsetMs);
  return d.toISOString().replace("T", " ").replace("Z", "+00");
}

function dateOnly(offsetDays: number): string {
  return new Date(NOW + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

const userIds = ["usr_ywcfpjfnfdzveactquu6q6wkb4", "usr_k2m9x1abcd8f7e6g5h4j3k2l1m", "usr_q7r8s9t0u1v2w3x4y5z6a7b8c9"];
const projectIds = ["prj_waszxoerymsl4wohbwjwrhkuve", "prj_kkynbi4xy5eitkulcxemsof7y4", "prj_karjzej7ebtpznkaffv7xdgaou", "prj_m3n4o5p6q7r8s9t0u1v2w3x4y5", "prj_a1b2c3d4e5f6g7h8i9j0k1l2m3"];

const users: MockTable = {
  table: table("public", "auth_users", "table", "managed", "Accounts, kept by modules/auth", 3, 64),
  columns: [
    col(1, "id", "text", { is_primary_key: true }),
    col(2, "email", "text", { is_nullable: false, is_unique: true }),
    col(3, "name", "text", { is_nullable: false, default_expr: "''::text" }),
    col(4, "email_verified", "bool", { is_nullable: false, default_expr: "false" }),
    col(5, "roles", "text", { is_array: true, is_nullable: false, default_expr: "'{}'::text[]" }),
    col(6, "last_sign_in_at", "timestamptz"),
    col(7, "created_at", "timestamptz", { is_nullable: false, default_expr: "now()" }),
  ],
  constraints: [pk("auth_users", ["id"]), unique("auth_users", ["email"])],
  indexes: [index("public", "auth_users", ["id"], { primary: true, scans: 412 }), index("public", "auth_users", ["email"], { unique: true, scans: 88 })],
  triggers: [],
  rows: [
    { id: userIds[0], email: "ana@acme.dev", name: "Ana Ruiz", email_verified: "t", roles: "{admin,owner}", last_sign_in_at: ts(12 * 60_000), created_at: ts(40 * 86_400_000) },
    { id: userIds[1], email: "ben@acme.dev", name: "Ben Okafor", email_verified: "t", roles: "{member}", last_sign_in_at: ts(3 * 3_600_000), created_at: ts(31 * 86_400_000) },
    { id: userIds[2], email: "cy@acme.dev", name: "Cy Tanaka", email_verified: "f", roles: "{}", last_sign_in_at: null, created_at: ts(2 * 86_400_000) },
  ],
  seq: 1,
};

const projectNames = ["Website redesign", "Mobile app", "Legacy import", "Billing v2", "Search index"];
const projectDescriptions = ["A new layout and faster pages.", "iOS and Android clients for the API.", "Moved the old data over; kept for reference.", "Invoices, taxes and the new plan.", "Typeahead over projects and tasks."];
const projects: MockTable = {
  table: table("public", "projects", "table", "user", "What a team works on", 5, 96),
  columns: [
    col(1, "id", "text", { is_primary_key: true }),
    col(2, "owner_id", "text", { is_nullable: false, fk_targets: ["public.auth_users"] }),
    col(3, "name", "text", { is_nullable: false, comment: "Shown in every list" }),
    col(4, "description", "text", { is_nullable: false, default_expr: "''::text" }),
    col(5, "status", "project_status", { is_nullable: false, default_expr: "'active'::project_status" }),
    col(6, "tags", "text", { is_array: true, is_nullable: false, default_expr: "'{}'::text[]" }),
    col(7, "settings", "jsonb", { is_nullable: false, default_expr: "'{}'::jsonb" }),
    col(8, "budget", "numeric", { comment: "In euros; NULL when not set" }),
    col(9, "version", "int8", { is_nullable: false, default_expr: "1" }),
    col(10, "created_at", "timestamptz", { is_nullable: false, default_expr: "now()" }),
    col(11, "updated_at", "timestamptz", { is_nullable: false, default_expr: "now()" }),
  ],
  constraints: [
    pk("projects", ["id"]),
    fk("projects", ["owner_id"], "public", "auth_users", ["id"]),
    check("projects", "name", "char_length(name) >= 1 AND char_length(name) <= 100"),
    check("projects", "description", "char_length(description) <= 2000"),
  ],
  indexes: [index("public", "projects", ["id"], { primary: true, scans: 1204 }), index("public", "projects", ["owner_id"], { scans: 57 }), index("public", "projects", ["settings"], { method: "gin" })],
  triggers: [
    {
      id: nextOid++,
      name: "projects_touch_updated_at",
      definition: "CREATE TRIGGER projects_touch_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION touch_updated_at()",
      enabled: "origin",
      timing: "BEFORE",
      orientation: "ROW",
      events: ["UPDATE"],
      function_schema: "public",
      function_name: "touch_updated_at",
    },
  ],
  rows: projectIds.map((id, i) => ({
    id,
    owner_id: userIds[i % 2],
    name: projectNames[i],
    description: projectDescriptions[i],
    status: i === 2 ? "archived" : i === 4 ? "draft" : "active",
    tags: i === 0 ? "{web,design}" : i === 1 ? '{mobile,"ios and android"}' : "{}",
    settings: i === 0 ? '{"theme": "dark", "notify": true}' : i === 3 ? '{"currency": "EUR", "tax": 0.21}' : "{}",
    budget: i === 3 ? "12500.00" : i === 0 ? "3200.50" : null,
    version: String(1 + (i % 3)),
    created_at: ts((30 - i * 4) * 86_400_000),
    updated_at: ts((6 - i) * 3_600_000),
  })),
  seq: 1,
};

const taskTitles = ["Write the spec", "Set up CI", "Design the schema", "Review the PR", "Ship it", "Fix the flaky test", "Update the docs", "Talk to support", "Plan the sprint", "Migrate the data"];
const tasks: MockTable = {
  table: table("public", "tasks", "table", "user", null, 40, 128),
  columns: [
    col(1, "id", "int8", { is_primary_key: true, identity: "d" }),
    col(2, "project_id", "text", { is_nullable: false, fk_targets: ["public.projects"] }),
    col(3, "title", "text", { is_nullable: false }),
    col(4, "done", "bool", { is_nullable: false, default_expr: "false" }),
    col(5, "priority", "int4", { is_nullable: false, default_expr: "3", comment: "1 (urgent) to 5 (someday)" }),
    col(6, "due", "date"),
    col(7, "created_at", "timestamptz", { is_nullable: false, default_expr: "now()" }),
  ],
  constraints: [pk("tasks", ["id"]), fk("tasks", ["project_id"], "public", "projects", ["id"]), check("tasks", "priority", "priority BETWEEN 1 AND 5")],
  indexes: [index("public", "tasks", ["id"], { primary: true, scans: 3391 }), index("public", "tasks", ["project_id"], { scans: 902 })],
  triggers: [],
  rows: Array.from({ length: 40 }, (_, i) => ({
    id: String(i + 1),
    project_id: projectIds[i % projectIds.length],
    title: `${taskTitles[i % taskTitles.length]}${i >= taskTitles.length ? ` (${Math.floor(i / taskTitles.length) + 1})` : ""}`,
    done: r.chance(0.4) ? "t" : "f",
    priority: String(r.int(1, 5)),
    due: r.chance(0.7) ? dateOnly(r.int(-3, 20)) : null,
    created_at: ts((40 - i) * 5 * 3_600_000),
  })),
  seq: 41,
};

const auditEvents: MockTable = {
  table: table("public", "audit_events", "table", "managed", "Written by gorbital.dev/audit", 6, 120),
  columns: [
    col(1, "id", "int8", { is_primary_key: true, identity: "a" }),
    col(2, "actor_id", "text", { fk_targets: ["public.auth_users"] }),
    col(3, "action", "text", { is_nullable: false }),
    col(4, "target", "text"),
    col(5, "attrs", "jsonb", { is_nullable: false, default_expr: "'{}'::jsonb" }),
    col(6, "at", "timestamptz", { is_nullable: false, default_expr: "now()" }),
  ],
  constraints: [pk("audit_events", ["id"]), fk("audit_events", ["actor_id"], "public", "auth_users", ["id"], "SET NULL")],
  indexes: [index("public", "audit_events", ["id"], { primary: true }), index("public", "audit_events", ["at"], { scans: 14 })],
  triggers: [],
  rows: ["project.create", "project.update", "user.sign_in", "project.archive", "user.invite", "project.update"].map((action, i) => ({
    id: String(i + 1),
    actor_id: i === 4 ? null : userIds[i % 2],
    action,
    target: action.startsWith("project") ? projectIds[i % projectIds.length] : userIds[i % 3],
    attrs: i === 1 ? '{"fields": ["name", "status"]}' : "{}",
    at: ts((6 - i) * 40 * 60_000),
  })),
  seq: 7,
};

const sessions: MockTable = {
  table: table("auth", "sessions", "table", "managed", null, 2, 40),
  columns: [
    col(1, "id", "uuid", { is_primary_key: true, default_expr: "gen_random_uuid()" }),
    col(2, "user_id", "text", { is_nullable: false, fk_targets: ["public.auth_users"] }),
    col(3, "ip", "text"),
    col(4, "expires_at", "timestamptz", { is_nullable: false }),
    col(5, "created_at", "timestamptz", { is_nullable: false, default_expr: "now()" }),
  ],
  constraints: [pk("sessions", ["id"]), fk("sessions", ["user_id"], "public", "auth_users", ["id"])],
  indexes: [index("auth", "sessions", ["id"], { primary: true }), index("auth", "sessions", ["user_id"])],
  triggers: [],
  rows: [
    { id: "3f2b9c1e-7a4d-4e8b-9c2f-1a2b3c4d5e6f", user_id: userIds[0], ip: "127.0.0.1", expires_at: ts(-7 * 86_400_000), created_at: ts(12 * 60_000) },
    { id: "8a1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e", user_id: userIds[1], ip: "10.0.0.8", expires_at: ts(-6 * 86_400_000), created_at: ts(3 * 3_600_000) },
  ],
  seq: 1,
};

const notes: MockTable = {
  table: table("public", "notes", "table", "user", "No primary key: read-only in the editor", 2, 16),
  columns: [col(1, "body", "text", { is_nullable: false }), col(2, "written_at", "timestamptz", { is_nullable: false, default_expr: "now()" })],
  constraints: [],
  indexes: [],
  triggers: [],
  rows: [
    { body: "Remember to rotate the API keys.", written_at: ts(2 * 86_400_000) },
    { body: "Ana owns the billing project now.", written_at: ts(5 * 3_600_000) },
  ],
  seq: 1,
};

const riverJob: MockTable = {
  table: table("public", "river_job", "table", "system", null, 3, 200),
  columns: [
    col(1, "id", "int8", { is_primary_key: true, identity: "a" }),
    col(2, "kind", "text", { is_nullable: false }),
    col(3, "queue", "text", { is_nullable: false, default_expr: "'default'::text" }),
    col(4, "state", "text", { is_nullable: false, default_expr: "'available'::text" }),
    col(5, "args", "jsonb", { is_nullable: false }),
    col(6, "attempt", "int2", { is_nullable: false, default_expr: "0" }),
    col(7, "scheduled_at", "timestamptz", { is_nullable: false, default_expr: "now()" }),
  ],
  constraints: [pk("river_job", ["id"])],
  indexes: [index("public", "river_job", ["id"], { primary: true, scans: 5120 }), index("public", "river_job", ["state", "queue"], { scans: 4001 })],
  triggers: [],
  rows: [
    { id: "1", kind: "mail.Send", queue: "default", state: "completed", args: '{"to": "ana@acme.dev", "template": "welcome"}', attempt: "1", scheduled_at: ts(50 * 60_000) },
    { id: "2", kind: "audit.Prune", queue: "maintenance", state: "completed", args: "{}", attempt: "1", scheduled_at: ts(30 * 60_000) },
    { id: "3", kind: "mail.Send", queue: "default", state: "retryable", args: '{"to": "cy@acme.dev", "template": "verify"}', attempt: "2", scheduled_at: ts(-5 * 60_000) },
  ],
  seq: 4,
};

const activeProjects: MockTable = {
  table: table("public", "active_projects", "view", "user", "Projects that aren't archived", 0, 0),
  columns: [col(1, "id", "text"), col(2, "name", "text"), col(3, "owner_email", "text"), col(4, "open_tasks", "int8")],
  constraints: [],
  indexes: [],
  triggers: [],
  rows: [],
  seq: 1,
  definition: " SELECT p.id,\n    p.name,\n    u.email AS owner_email,\n    count(t.id) FILTER (WHERE NOT t.done) AS open_tasks\n   FROM projects p\n     JOIN auth_users u ON u.id = p.owner_id\n     LEFT JOIN tasks t ON t.project_id = p.id\n  WHERE p.status <> 'archived'::project_status\n  GROUP BY p.id, u.email;",
};

const schemas: Schema[] = [
  { id: 2200, name: "public", owner: "pg_database_owner", comment: "standard public schema", system: false, has_extensions: false },
  { id: 16390, name: "auth", owner: "acme", comment: "modules/auth's private tables", system: false, has_extensions: false },
  { id: 13293, name: "information_schema", owner: "acme", comment: null, system: true, has_extensions: false },
  { id: 11, name: "pg_catalog", owner: "acme", comment: "system catalog schema", system: true, has_extensions: true },
];

const pgCatalogSample: MockTable = {
  table: { ...table("pg_catalog", "pg_class", "table", "system", "system catalog", 412, 160), owner: "postgres" },
  columns: [col(1, "oid", "int8", { is_primary_key: true }), col(2, "relname", "text", { is_nullable: false }), col(3, "relkind", "text", { is_nullable: false }), col(4, "reltuples", "float4", { is_nullable: false })],
  constraints: [pk("pg_class", ["oid"])],
  indexes: [index("pg_catalog", "pg_class", ["oid"], { primary: true })],
  triggers: [],
  rows: [
    { oid: "16592", relname: "projects", relkind: "r", reltuples: "5" },
    { oid: "16611", relname: "projects_pkey", relkind: "i", reltuples: "5" },
    { oid: "16640", relname: "tasks", relkind: "r", reltuples: "40" },
  ],
  seq: 1,
};

const initialTables = () => [users, projects, tasks, auditEvents, sessions, notes, riverJob, activeProjects, pgCatalogSample];

let tables: MockTable[] = initialTables().map(cloneTable);
let migrationSeq = 14;

function cloneTable(t: MockTable): MockTable {
  return { ...t, table: { ...t.table }, columns: t.columns.map((c) => ({ ...c })), constraints: [...t.constraints], indexes: [...t.indexes], triggers: [...t.triggers], rows: t.rows.map((row) => ({ ...row })) };
}

/** Back to the first state; tests call it between cases. */
export function resetMockDb() {
  tables = initialTables().map(cloneTable);
  migrationSeq = 14;
}

/* ---------- Responses ---------- */

function problem(status: number, code: string, detail: string): Response {
  const p: Problem = { title: { 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 409: "Conflict", 422: "Unprocessable Entity", 500: "Internal Server Error" }[status] ?? "Error", status, code, detail };
  return new Response(JSON.stringify(p), { status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } });
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

class DbError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    detail: string,
  ) {
    super(detail);
  }
}

const invalid = (detail: string) => new DbError(422, "invalid_input", detail);

/* ---------- Catalog ---------- */

function find(schema: string, name: string): MockTable {
  const t = tables.find((t) => t.table.schema === schema && t.table.name === name);
  if (!t) throw new DbError(404, "not_found", `not found: ${schema}.${name}`);
  return t;
}

function detail(t: MockTable): TableDetail {
  return { table: t.table, columns: t.columns, constraints: t.constraints, indexes: t.indexes, triggers: t.triggers, primary_key: t.constraints.find((c) => c.type === "p")?.columns ?? [] };
}

function schemasOf(url: URL): string[] {
  const q = url.searchParams.getAll("schema");
  return q.length ? q : schemas.filter((s) => !s.system).map((s) => s.name);
}

const pickerTypes: TypeOption[] = [
  { name: "int2", sql: "smallint", group: "Numeric", description: "Signed two-byte integer" },
  { name: "int4", sql: "integer", group: "Numeric", description: "Signed four-byte integer" },
  { name: "int8", sql: "bigint", group: "Numeric", description: "Signed eight-byte integer" },
  { name: "float4", sql: "real", group: "Numeric", description: "Single precision floating-point number (4 bytes)" },
  { name: "float8", sql: "double precision", group: "Numeric", description: "Double precision floating-point number (8 bytes)" },
  { name: "numeric", sql: "numeric", group: "Numeric", description: "Exact numeric of selectable precision, such as numeric(10,2)" },
  { name: "json", sql: "json", group: "JSON", description: "Textual JSON data (prefer jsonb)", suggestions: ["'{}'", "'[]'"] },
  { name: "jsonb", sql: "jsonb", group: "JSON", description: "Binary JSON data, decomposed", suggestions: ["'{}'::jsonb", "'[]'::jsonb"] },
  { name: "text", sql: "text", group: "Text", description: "Variable-length character string", suggestions: ["''"] },
  { name: "varchar", sql: "character varying", group: "Text", description: "Character string with a limit, such as varchar(100) (prefer text)", suggestions: ["''"] },
  { name: "uuid", sql: "uuid", group: "Text", description: "Universally unique identifier", suggestions: ["gen_random_uuid()", "uuidv7()"] },
  { name: "date", sql: "date", group: "Date and time", description: "Calendar date (year, month, day)", suggestions: ["CURRENT_DATE"] },
  { name: "time", sql: "time", group: "Date and time", description: "Time of day (no time zone)", suggestions: ["now()"] },
  { name: "timetz", sql: "time with time zone", group: "Date and time", description: "Time of day, including time zone (prefer timestamptz)" },
  { name: "timestamp", sql: "timestamp", group: "Date and time", description: "Date and time (no time zone; prefer timestamptz)", suggestions: ["now()"] },
  { name: "timestamptz", sql: "timestamptz", group: "Date and time", description: "Date and time, including time zone", suggestions: ["now()"] },
  { name: "bool", sql: "boolean", group: "Boolean", description: "Logical boolean (true or false)", suggestions: ["false", "true"] },
  { name: "bytea", sql: "bytea", group: "Binary", description: "Variable-length binary string" },
];

function types(schemaNames: string[]): TypeOption[] {
  return [...pickerTypes, ...enums.filter((e) => schemaNames.includes(e.schema)).map((e) => ({ name: `${e.schema}.${e.name}`, sql: `${e.schema}.${e.name}`, group: "Enums", description: "Enum: " + e.values.join(", "), enum_values: e.values }))];
}

/* ---------- Rows ---------- */

const numericTypes = new Set(["int2", "int4", "int8", "float4", "float8", "numeric"]);

function isNumeric(c: Column) {
  return !c.is_array && numericTypes.has(c.type_name);
}

function likeToRegExp(pattern: string, flags: string): RegExp {
  const src = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("%", ".*").replaceAll("_", ".");
  return new RegExp(`^${src}$`, flags + "s");
}

function compare(c: Column, a: string, b: string): number {
  if (isNumeric(c)) return Number(a) - Number(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

function matches(c: Column, v: Cell, f: Filter): boolean {
  if (f.operator === "is") {
    switch ((f.value ?? "").trim().toLowerCase()) {
      case "null":
        return v === null;
      case "not null":
        return v !== null;
      case "true":
        return v === "t";
      case "false":
        return v === "f";
      default:
        throw invalid('invalid input: "is" takes null, not null, true or false');
    }
  }
  if (v === null) return false;
  if (f.operator === "in") return (f.values ?? []).some((x) => (isNumeric(c) ? Number(x) === Number(v) : x === v));
  const val = f.value ?? "";
  if (isNumeric(c) && Number.isNaN(Number(val)) && !["~~", "~~*"].includes(f.operator)) throw invalid(`invalid input syntax for type ${c.data_type}: "${val}"`);
  switch (f.operator) {
    case "=":
      return compare(c, v, val) === 0;
    case "<>":
      return compare(c, v, val) !== 0;
    case ">":
      return compare(c, v, val) > 0;
    case "<":
      return compare(c, v, val) < 0;
    case ">=":
      return compare(c, v, val) >= 0;
    case "<=":
      return compare(c, v, val) <= 0;
    case "~~":
      return likeToRegExp(val, "").test(v);
    case "~~*":
      return likeToRegExp(val, "i").test(v);
    default:
      throw new DbError(422, "invalid_input", `unknown operator: "${String(f.operator)}"`);
  }
}

function column(t: MockTable, name: string): Column {
  const c = t.columns.find((c) => c.name === name);
  if (!c) throw new DbError(422, "invalid_input", `unknown column: "${name}"`);
  return c;
}

function viewRows(t: MockTable): Record<string, Cell>[] {
  if (t.table.name !== "active_projects") return t.rows;
  const p = find("public", "projects");
  const u = find("public", "auth_users");
  const tk = find("public", "tasks");
  return p.rows
    .filter((row) => row.status !== "archived")
    .map((row) => ({
      id: row.id,
      name: row.name,
      owner_email: u.rows.find((x) => x.id === row.owner_id)?.email ?? null,
      open_tasks: String(tk.rows.filter((x) => x.project_id === row.id && x.done === "f").length),
    }));
}

function query(q: RowQuery): RowPage {
  const t = find(q.schema, q.table);
  const limit = Math.min(Math.max(q.limit ?? 100, 1), 1000);
  const offset = Math.max(q.offset ?? 0, 0);
  const filters = q.filters ?? [];
  const sorts: Sort[] = q.sorts ?? [];
  for (const f of filters) column(t, f.column);
  for (const s of sorts) column(t, s.column);
  const d = detail(t);
  let rows = viewRows(t).filter((row) => filters.every((f) => matches(column(t, f.column), row[f.column] ?? null, f)));
  const terms = [...sorts];
  for (const k of d.primary_key) if (!terms.some((s) => s.column === k)) terms.push({ column: k });
  if (terms.length) {
    rows = [...rows].sort((a, b) => {
      for (const s of terms) {
        const c = column(t, s.column);
        const x = a[s.column] ?? null;
        const y = b[s.column] ?? null;
        if (x === y) continue;
        if (x === null) return s.nulls_first ? -1 : 1;
        if (y === null) return s.nulls_first ? 1 : -1;
        const cmp = compare(c, x, y);
        if (cmp !== 0) return s.descending ? -cmp : cmp;
      }
      return 0;
    });
  }
  return {
    columns: t.columns,
    primary_key: d.primary_key,
    rows: rows.slice(offset, offset + limit).map((row) => t.columns.map((c) => row[c.name] ?? null)),
    count: rows.length,
    estimated: false,
    limit,
    offset,
  };
}

function nowLiteral(): string {
  return new Date().toISOString().replace("T", " ").replace("Z", "+00");
}

/** Checks one value the way PostgreSQL would when it parses the literal. */
function coerce(t: MockTable, c: Column, v: Cell): Cell {
  if (v === null) {
    if (!c.is_nullable) throw invalid(`null value in column "${c.name}" of relation "${t.table.name}" violates not-null constraint`);
    return null;
  }
  if (c.is_array) {
    if (!v.startsWith("{") || !v.endsWith("}")) throw invalid(`malformed array literal: "${v}"`);
    return v;
  }
  if (c.enum_values && !c.enum_values.includes(v)) throw invalid(`invalid input value for enum ${c.type_name}: "${v}"`);
  if (isNumeric(c)) {
    if (Number.isNaN(Number(v)) || v.trim() === "") throw invalid(`invalid input syntax for type ${c.data_type}: "${v}"`);
    if (["int2", "int4", "int8"].includes(c.type_name) && !/^-?\d+$/.test(v.trim())) throw invalid(`invalid input syntax for type ${c.data_type}: "${v}"`);
    return String(Number(v));
  }
  if (c.type_name === "bool") {
    const b = v.trim().toLowerCase();
    if (["t", "true", "yes", "on", "1"].includes(b)) return "t";
    if (["f", "false", "no", "off", "0"].includes(b)) return "f";
    throw invalid(`invalid input syntax for type boolean: "${v}"`);
  }
  if (c.type_name === "json" || c.type_name === "jsonb") {
    try {
      return c.type_name === "jsonb" ? JSON.stringify(JSON.parse(v)).replaceAll('":', '": ').replaceAll(",", ", ") : v;
    } catch {
      throw invalid(`invalid input syntax for type json`);
    }
  }
  if (c.type_name === "date" && !/^\d{4}-\d\d-\d\d$/.test(v.trim())) throw invalid(`invalid input syntax for type date: "${v}"`);
  if ((c.type_name === "timestamptz" || c.type_name === "timestamp") && Number.isNaN(Date.parse(v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")))) {
    throw invalid(`invalid input syntax for type ${c.data_type}: "${v}"`);
  }
  if (c.type_name === "uuid" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim())) throw invalid(`invalid input syntax for type uuid: "${v}"`);
  return v;
}

function defaultValue(t: MockTable, c: Column): Cell {
  if (c.identity) return String(t.seq++);
  const d = c.default_expr;
  if (d === null) return null;
  if (d === "now()" || d === "CURRENT_TIMESTAMP") return nowLiteral();
  if (d === "CURRENT_DATE") return new Date().toISOString().slice(0, 10);
  if (d === "gen_random_uuid()" || d === "uuidv7()") return crypto.randomUUID();
  const m = /^'(.*)'(?:::.+)?$/s.exec(d);
  if (m) return c.type_name === "jsonb" ? coerce(t, c, m[1]) : m[1];
  if (/^-?\d+(\.\d+)?$/.test(d)) return d;
  if (d === "true" || d === "false") return d === "true" ? "t" : "f";
  return d;
}

function writable(t: MockTable, needKey: boolean): string[] {
  const d = detail(t);
  if (t.table.kind !== "table" && t.table.kind !== "partitioned_table") throw new DbError(409, "no_primary_key", `${t.table.schema}.${t.table.name} is a ${t.table.kind.replace("_", " ")}; its rows can't be edited`);
  if (needKey && d.primary_key.length === 0) throw new DbError(409, "no_primary_key", `${t.table.schema}.${t.table.name} has no primary key; its rows can't be edited`);
  if (t.table.ownership === "system") throw new DbError(403, "system_table", `${t.table.schema}.${t.table.name} is a system table`);
  return d.primary_key;
}

function buildRow(t: MockTable, values: Record<string, Cell>): Record<string, Cell> {
  for (const name of Object.keys(values)) column(t, name);
  const row: Record<string, Cell> = {};
  for (const c of t.columns) {
    if (c.identity === "a" && c.name in values && values[c.name] !== undefined) {
      throw invalid(`cannot insert a non-DEFAULT value into column "${c.name}": column "${c.name}" is an identity column defined as GENERATED ALWAYS`);
    }
    row[c.name] = c.name in values ? coerce(t, c, values[c.name]) : defaultValue(t, c);
    if (row[c.name] === null && !c.is_nullable) throw invalid(`null value in column "${c.name}" of relation "${t.table.name}" violates not-null constraint`);
  }
  const pkCols = detail(t).primary_key;
  if (pkCols.length && t.rows.some((r) => pkCols.every((k) => r[k] === row[k]))) {
    throw invalid(`duplicate key value violates unique constraint "${t.table.name}_pkey"`);
  }
  return row;
}

function insert(e: RowEdit): Cell[] {
  const t = find(e.schema, e.table);
  writable(t, false);
  const row = buildRow(t, e.values ?? {});
  t.rows.push(row);
  t.table.live_rows = t.rows.length;
  return t.columns.map((c) => row[c.name] ?? null);
}

function importMany(req: ImportRequest): number {
  const t = find(req.schema, req.table);
  writable(t, false);
  if (!req.rows?.length || req.rows.length > 1000) throw invalid("import 1 to 1000 rows at a time");
  const built: Record<string, Cell>[] = [];
  const seq = t.seq;
  try {
    req.rows.forEach((values, i) => {
      try {
        built.push(buildRow(t, values));
        t.rows.push(built[built.length - 1]);
      } catch (err) {
        throw err instanceof DbError ? new DbError(err.status, err.code, `row ${i + 1}: ${err.message}`) : err;
      }
    });
  } catch (err) {
    t.rows.splice(t.rows.length - built.length, built.length);
    t.seq = seq;
    throw err;
  }
  t.table.live_rows = t.rows.length;
  return built.length;
}

function locate(t: MockTable, pkCols: string[], key: RowKey): number {
  for (const k of pkCols) if (key[k] === undefined || key[k] === null) throw invalid(`the key needs "${k}"`);
  return t.rows.findIndex((r) => pkCols.every((k) => r[k] === key[k]));
}

function update(e: RowEdit): Cell[] {
  const t = find(e.schema, e.table);
  const pkCols = writable(t, true);
  if ((e.keys ?? []).length !== 1) throw invalid("an update names exactly one row");
  if (!e.values || Object.keys(e.values).length === 0) throw invalid("nothing to change");
  const i = locate(t, pkCols, e.keys![0]);
  if (i < 0) throw new DbError(409, "row_count", "0 rows");
  const row = { ...t.rows[i] };
  for (const [name, v] of Object.entries(e.values)) {
    const c = column(t, name);
    if (c.identity === "a") throw invalid(`column "${c.name}" can only be updated to DEFAULT`);
    row[name] = coerce(t, c, v);
  }
  if (t.columns.some((c) => c.name === "updated_at")) row.updated_at = nowLiteral();
  t.rows[i] = row;
  return t.columns.map((c) => row[c.name] ?? null);
}

function remove(e: RowEdit): number {
  const t = find(e.schema, e.table);
  const pkCols = writable(t, true);
  const keys = e.keys ?? [];
  if (!keys.length) throw invalid("no rows named");
  const idx = keys.map((k) => locate(t, pkCols, k));
  const found = idx.filter((i) => i >= 0);
  if (found.length !== keys.length) throw new DbError(409, "row_count", `${found.length} of ${keys.length} rows found`);
  const drop = new Set(found);
  t.rows = t.rows.filter((_, i) => !drop.has(i));
  t.table.live_rows = t.rows.length;
  return found.length;
}

/* ---------- DDL ---------- */

const ident = (s: string) => (/^[a-z_][a-z0-9_]*$/.test(s) ? s : `"${s.replaceAll('"', '""')}"`);
const lit = (s: string) => `'${s.replaceAll("'", "''")}'`;
const identPat = /^[A-Za-z_][A-Za-z0-9_]*$/;

function checkIdent(kind: string, name: string) {
  if (!identPat.test(name) || name.length > 63) throw invalid(`${kind} "${name}" must be letters, digits and underscores, starting with a letter`);
}

function typeSQL(spec: ColumnSpec): string {
  const name = spec.type.trim();
  let sql: string;
  const sized = /^(numeric|varchar|character varying|decimal)\((\d+)(,\s*\d+)?\)$/.exec(name);
  const enumRef = /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(name);
  if (!name) throw invalid(`column "${spec.name}" needs a type`);
  if (sized) sql = `${sized[1] === "varchar" ? "character varying" : sized[1]}(${sized[2]}${(sized[3] ?? "").replace(/\s/g, "")})`;
  else if (enumRef) {
    if (!enums.some((e) => e.schema === enumRef[1] && e.name === enumRef[2])) throw invalid(`no enum ${name}`);
    sql = `${ident(enumRef[1])}.${ident(enumRef[2])}`;
  } else {
    const t = pickerTypes.find((t) => t.name === name || t.sql === name);
    if (!t) throw invalid(`unknown type "${name}"`);
    sql = t.sql;
  }
  return spec.array ? `${sql}[]` : sql;
}

function defaultSQL(spec: ColumnSpec): string {
  if (spec.default === undefined) return "";
  return spec.default_is_expr ? spec.default : lit(spec.default);
}

function fkAction(clause: string, action: string | undefined): string {
  const a = (action ?? "").toUpperCase().trim();
  if (!["", "NO ACTION", "RESTRICT", "CASCADE", "SET NULL", "SET DEFAULT"].includes(a)) throw invalid(`${clause} must be NO ACTION, RESTRICT, CASCADE, SET NULL or SET DEFAULT`);
  return a === "" || a === "NO ACTION" ? "" : ` ${clause} ${a}`;
}

function columnDef(spec: ColumnSpec): string {
  checkIdent("column", spec.name);
  const parts = [ident(spec.name), typeSQL(spec)];
  if (spec.identity === "always") parts.push("GENERATED ALWAYS AS IDENTITY");
  else if (spec.identity === "by_default") parts.push("GENERATED BY DEFAULT AS IDENTITY");
  else if (spec.identity && spec.identity !== "none") throw invalid("identity is always or by_default");
  if (spec.primary_key) parts.push("PRIMARY KEY");
  else if (spec.nullable === false) parts.push("NOT NULL");
  const d = defaultSQL(spec);
  if (d) parts.push(`DEFAULT ${d}`);
  if (spec.unique && !spec.primary_key) parts.push("UNIQUE");
  if (spec.check) parts.push(`CHECK (${spec.check})`);
  if (spec.references) {
    const fk = spec.references;
    if (fk.ref_columns.length !== 1) throw invalid("an inline reference names one column");
    parts.push(`REFERENCES ${ident(fk.ref_schema)}.${ident(fk.ref_table)} (${ident(fk.ref_columns[0])})${fkAction("ON DELETE", fk.on_delete)}${fkAction("ON UPDATE", fk.on_update)}`);
  }
  return parts.join(" ");
}

function fkDef(table: string, fk: FKSpec): { name: string; sql: string } {
  if (!fk.columns?.length) throw invalid("a foreign key needs columns");
  if (fk.ref_columns?.length !== fk.columns.length) throw invalid("a foreign key references as many columns as it has");
  const name = fk.name || `${table}_${fk.columns.join("_")}_fkey`;
  return {
    name,
    sql: `CONSTRAINT ${ident(name)} FOREIGN KEY (${fk.columns.map(ident).join(", ")}) REFERENCES ${ident(fk.ref_schema)}.${ident(fk.ref_table)} (${fk.ref_columns.map(ident).join(", ")})${fkAction("ON DELETE", fk.on_delete)}${fkAction("ON UPDATE", fk.on_update)}`,
  };
}

function nullNote(c: Column) {
  return c.is_nullable ? "" : " NOT NULL";
}

/** Renders a change as SQL, checking it against the catalog like pgmeta does. */
function plan(ch: Change): DDLPlan {
  const schema = ch.schema || "public";
  const t = `${ident(schema)}.${ident(ch.table ?? "")}`;
  const alter = `ALTER TABLE ${t} `;
  const p: DDLPlan = { summary: "", up: [], down: [], irreversible: false, notes: [] };
  const existing = ch.kind === "create_table" ? undefined : find(schema, ch.table ?? "");
  if (existing && existing.table.ownership !== "user") throw new DbError(403, "system_table", `${schema}.${ch.table} is a ${existing.table.ownership} table; its schema belongs to ${existing.table.ownership === "managed" ? "the framework's migrations" : "its tool"}`);
  const col = (name: string): Column => {
    const c = existing?.columns.find((c) => c.name === name);
    if (!c) throw invalid(`unknown column: "${name}"`);
    return c;
  };
  switch (ch.kind) {
    case "create_table": {
      checkIdent("table", ch.table ?? "");
      if (tables.some((x) => x.table.schema === schema && x.table.name === ch.table)) throw invalid(`relation "${ch.table}" already exists`);
      if (!ch.columns?.length) throw invalid("a table needs columns");
      const lines = ch.columns.map((c) => "    " + columnDef(c));
      const after: string[] = [];
      for (const c of ch.columns) if (c.comment) after.push(`COMMENT ON COLUMN ${t}.${ident(c.name)} IS ${lit(c.comment)};`);
      for (const u of ch.uniques ?? []) {
        if (!u.length) throw invalid("a unique constraint needs columns");
        lines.push(`    CONSTRAINT ${ident(`${ch.table}_${u.join("_")}_key`)} UNIQUE (${u.map(ident).join(", ")})`);
      }
      for (const fk of ch.foreign_keys ?? []) lines.push("    " + fkDef(ch.table ?? "", fk).sql);
      p.summary = `Create ${ch.table}`;
      p.up = [`CREATE TABLE ${t} (\n${lines.join(",\n")}\n);`, ...after];
      p.down = [`DROP TABLE ${t};`];
      break;
    }
    case "drop_table":
      p.summary = `Drop ${ch.table}`;
      p.up = [`DROP TABLE ${t}${ch.cascade ? " CASCADE" : ""};`];
      p.irreversible = true;
      p.notes!.push("dropping a table loses its rows; recreate it from the app's earlier migrations");
      break;
    case "rename_table":
      checkIdent("table", ch.new_name ?? "");
      p.summary = `Rename ${ch.table} to ${ch.new_name}`;
      p.up = [`${alter}RENAME TO ${ident(ch.new_name!)};`];
      p.down = [`ALTER TABLE ${ident(schema)}.${ident(ch.new_name!)} RENAME TO ${ident(ch.table!)};`];
      break;
    case "add_column": {
      if (!ch.column) throw invalid("add_column needs a column");
      if (existing?.columns.some((c) => c.name === ch.column!.name)) throw invalid(`column "${ch.column.name}" exists`);
      const def = columnDef(ch.column);
      p.summary = `Add ${ch.column.name} to ${ch.table}`;
      p.up = [`${alter}ADD COLUMN ${def};`];
      if (ch.column.comment) p.up.push(`COMMENT ON COLUMN ${t}.${ident(ch.column.name)} IS ${lit(ch.column.comment)};`);
      p.down = [`${alter}DROP COLUMN ${ident(ch.column.name)};`];
      break;
    }
    case "drop_column": {
      if (!ch.column) throw invalid("drop_column needs a column");
      const c = col(ch.column.name);
      p.summary = `Drop ${c.name} from ${ch.table}`;
      p.up = [`${alter}DROP COLUMN ${ident(c.name)}${ch.cascade ? " CASCADE" : ""};`];
      p.irreversible = true;
      p.notes!.push(`dropping a column loses its values; it was ${c.data_type}${nullNote(c)}`);
      p.down = [`-- ${alter}ADD COLUMN ${ident(c.name)} ${c.data_type}${nullNote(c)};  -- values are lost`];
      break;
    }
    case "rename_column": {
      if (!ch.column) throw invalid("rename_column needs a column");
      const c = col(ch.column.name);
      checkIdent("column", ch.new_name ?? "");
      p.summary = `Rename ${c.name} to ${ch.new_name} in ${ch.table}`;
      p.up = [`${alter}RENAME COLUMN ${ident(c.name)} TO ${ident(ch.new_name!)};`];
      p.down = [`${alter}RENAME COLUMN ${ident(ch.new_name!)} TO ${ident(c.name)};`];
      break;
    }
    case "alter_column": {
      if (!ch.column) throw invalid("alter_column needs a column");
      const c = col(ch.column.name);
      const target = ch.column;
      const a = `${alter}ALTER COLUMN ${ident(c.name)} `;
      if (target.nullable !== undefined && target.nullable !== c.is_nullable) {
        p.up.push(`${a}${target.nullable ? "DROP NOT NULL" : "SET NOT NULL"};`);
        p.down.push(`${a}${c.is_nullable ? "DROP NOT NULL" : "SET NOT NULL"};`);
      }
      if (target.type) {
        const newType = typeSQL(target);
        if (newType !== c.data_type) {
          p.up.push(`${a}SET DATA TYPE ${newType} USING ${ident(c.name)}::${newType};`);
          p.down.push(`${a}SET DATA TYPE ${c.data_type} USING ${ident(c.name)}::${c.data_type};`);
          p.notes!.push("changing the type converts every value with a cast; a narrowing cast can fail or lose data");
        }
      }
      if (target.default !== undefined) {
        const d = defaultSQL(target);
        p.up.push(d === "" ? `${a}DROP DEFAULT;` : `${a}SET DEFAULT ${d};`);
        p.down.push(c.default_expr === null ? `${a}DROP DEFAULT;` : `${a}SET DEFAULT ${c.default_expr};`);
      }
      if (target.identity) {
        const words = { always: "ALWAYS", by_default: "BY DEFAULT" }[target.identity as "always" | "by_default"];
        const current = c.identity === "a" ? "ALWAYS" : c.identity === "d" ? "BY DEFAULT" : "";
        if (target.identity === "none" && current) {
          p.up.push(`${a}DROP IDENTITY IF EXISTS;`);
          p.down.push(`${a}ADD GENERATED ${current} AS IDENTITY;`);
          p.notes!.push("dropping the identity ends its sequence; adding it back starts a new one");
        } else if (words && !current) {
          p.up.push(`${a}ADD GENERATED ${words} AS IDENTITY;`);
          p.down.push(`${a}DROP IDENTITY IF EXISTS;`);
        } else if (words && current !== words) {
          p.up.push(`${a}SET GENERATED ${words};`);
          p.down.push(`${a}SET GENERATED ${current};`);
        } else if (target.identity !== "none") throw invalid("identity is none, always or by_default");
      }
      if (target.unique && !c.is_unique) {
        const name = `${ch.table}_${c.name}_key`;
        p.up.push(`${alter}ADD CONSTRAINT ${ident(name)} UNIQUE (${ident(c.name)});`);
        p.down.push(`${alter}DROP CONSTRAINT ${ident(name)};`);
      }
      if (target.comment && target.comment !== c.comment) {
        p.up.push(`COMMENT ON COLUMN ${t}.${ident(c.name)} IS ${lit(target.comment)};`);
        p.down.push(`COMMENT ON COLUMN ${t}.${ident(c.name)} IS ${c.comment === null ? "NULL" : lit(c.comment)};`);
      }
      if (!p.up.length) throw invalid("nothing changes");
      p.summary = `Change ${c.name} in ${ch.table}`;
      break;
    }
    case "add_foreign_key": {
      if (!ch.foreign_key) throw invalid("add_foreign_key needs a foreign key");
      const { name, sql } = fkDef(ch.table ?? "", ch.foreign_key);
      p.summary = `Add foreign key ${name} to ${ch.table}`;
      p.up = [`${alter}ADD ${sql};`];
      p.down = [`${alter}DROP CONSTRAINT ${ident(name)};`];
      break;
    }
    case "add_unique": {
      if (!ch.unique?.length) throw invalid("a unique constraint needs columns");
      const name = `${ch.table}_${ch.unique.join("_")}_key`;
      p.summary = `Add unique ${ch.unique.join(", ")} to ${ch.table}`;
      p.up = [`${alter}ADD CONSTRAINT ${ident(name)} UNIQUE (${ch.unique.map(ident).join(", ")});`];
      p.down = [`${alter}DROP CONSTRAINT ${ident(name)};`];
      break;
    }
    case "add_check": {
      if (!ch.check) throw invalid("a check constraint needs an expression");
      const name = ch.name || `${ch.table}_check`;
      p.summary = `Add check ${name} to ${ch.table}`;
      p.up = [`${alter}ADD CONSTRAINT ${ident(name)} CHECK (${ch.check});`];
      p.down = [`${alter}DROP CONSTRAINT ${ident(name)};`];
      break;
    }
    case "drop_constraint": {
      const c = existing?.constraints.find((x) => x.name === ch.constraint_name);
      if (!c) throw invalid(`unknown constraint: "${ch.constraint_name}"`);
      p.summary = `Drop constraint ${c.name} from ${ch.table}`;
      p.up = [`${alter}DROP CONSTRAINT ${ident(c.name)};`];
      p.down = [`${alter}ADD CONSTRAINT ${ident(c.name)} ${c.definition};`];
      break;
    }
    case "set_primary_key": {
      if (!ch.primary_key?.length) throw invalid("a primary key needs columns");
      const old = existing?.constraints.find((x) => x.type === "p");
      const name = `${ch.table}_pkey`;
      p.summary = `Set primary key of ${ch.table} to ${ch.primary_key.join(", ")}`;
      if (old) p.up.push(`${alter}DROP CONSTRAINT ${ident(old.name)};`);
      p.up.push(`${alter}ADD CONSTRAINT ${ident(name)} PRIMARY KEY (${ch.primary_key.map(ident).join(", ")});`);
      p.down.push(`${alter}DROP CONSTRAINT ${ident(name)};`);
      if (old) p.down.push(`${alter}ADD CONSTRAINT ${ident(old.name)} ${old.definition};`);
      break;
    }
    case "create_index": {
      if (!ch.index?.columns?.length) throw invalid("an index needs columns");
      const name = ch.index.name || `${ch.table}_${ch.index.columns.join("_")}_idx`;
      p.summary = `Index ${ch.index.columns.join(", ")} on ${ch.table}`;
      p.up = [`CREATE ${ch.index.unique ? "UNIQUE " : ""}INDEX ${ch.index.concurrently ? "CONCURRENTLY " : ""}${ident(name)} ON ${t}${ch.index.method ? ` USING ${ch.index.method}` : ""} (${ch.index.columns.join(", ")})${ch.index.where ? ` WHERE ${ch.index.where}` : ""};`];
      p.down = [`DROP INDEX ${ident(schema)}.${ident(name)};`];
      if (ch.index.concurrently) p.no_transaction = true;
      break;
    }
    case "drop_index": {
      const ix = existing?.indexes.find((x) => x.name === ch.index_name);
      if (!ix) throw invalid(`unknown index: "${ch.index_name}"`);
      p.summary = `Drop index ${ix.name}`;
      p.up = [`DROP INDEX ${ident(schema)}.${ident(ix.name)};`];
      p.down = [`${ix.definition};`];
      break;
    }
    case "comment": {
      const target = ch.column ? `COLUMN ${t}.${ident(ch.column.name)}` : `TABLE ${t}`;
      const before = ch.column ? col(ch.column.name).comment : existing?.table.comment ?? null;
      p.summary = `Comment on ${ch.column ? ch.column.name + " in " : ""}${ch.table}`;
      p.up = [`COMMENT ON ${target} IS ${ch.comment ? lit(ch.comment) : "NULL"};`];
      p.down = [`COMMENT ON ${target} IS ${before ? lit(before) : "NULL"};`];
      break;
    }
    case "rls":
      p.summary = `${ch.enabled ? "Enable" : "Disable"} row level security on ${ch.table}`;
      p.up = [`${alter}${ch.enabled ? "ENABLE" : "DISABLE"} ROW LEVEL SECURITY;`];
      p.down = [`${alter}${ch.enabled ? "DISABLE" : "ENABLE"} ROW LEVEL SECURITY;`];
      break;
    case "create_enum":
      p.summary = `Create enum ${ch.name}`;
      p.up = [`CREATE TYPE ${ident(schema)}.${ident(ch.name ?? "")} AS ENUM (${(ch.values ?? []).map(lit).join(", ")});`];
      p.down = [`DROP TYPE ${ident(schema)}.${ident(ch.name ?? "")};`];
      break;
    case "add_enum_value":
      p.summary = `Add ${ch.value} to enum ${ch.name}`;
      p.up = [`ALTER TYPE ${ident(schema)}.${ident(ch.name ?? "")} ADD VALUE ${lit(ch.value ?? "")}${ch.after ? ` AFTER ${lit(ch.after)}` : ""};`];
      p.irreversible = true;
      p.notes!.push("PostgreSQL can't remove a value from an enum");
      p.no_transaction = true;
      break;
    case "rename_enum_value":
      p.summary = `Rename ${ch.value} to ${ch.new_name} in enum ${ch.name}`;
      p.up = [`ALTER TYPE ${ident(schema)}.${ident(ch.name ?? "")} RENAME VALUE ${lit(ch.value ?? "")} TO ${lit(ch.new_name ?? "")};`];
      p.down = [`ALTER TYPE ${ident(schema)}.${ident(ch.name ?? "")} RENAME VALUE ${lit(ch.new_name ?? "")} TO ${lit(ch.value ?? "")};`];
      break;
    default:
      throw invalid(`unknown change kind "${String(ch.kind)}"`);
  }
  if (!p.notes?.length) delete p.notes;
  return p;
}

function render(p: DDLPlan): string {
  let s = `-- ${p.summary}.\n--\n-- Written by the Dev Portal. Change this migration freely until it is\n-- released; afterwards, add a new one.\n\n`;
  if (p.no_transaction) s += "-- +goose NO TRANSACTION\n";
  s += "-- +goose Up\n" + p.up.map((x) => x + "\n").join("") + "\n-- +goose Down\n";
  for (const n of p.notes ?? []) s += `-- ${n}\n`;
  s += p.down.map((x) => x + "\n").join("");
  return s;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Applies a planned change to the in-memory catalog so the demo shows it. */
function applyToCatalog(ch: Change) {
  const schema = ch.schema || "public";
  const t = ch.kind === "create_table" ? undefined : find(schema, ch.table ?? "");
  const specToColumn = (spec: ColumnSpec, ordinal: number): Column => {
    const base = spec.type.replace(/\(.*$/, "").replace(/^.*\./, "");
    const isEnum = enums.some((e) => e.name === base);
    const c = col(ordinal, spec.name, isEnum ? base : pickerTypes.some((p) => p.name === base) ? base : "text", {
      is_array: spec.array,
      is_nullable: spec.primary_key ? false : spec.nullable !== false,
      default_expr: spec.default !== undefined ? (spec.default_is_expr ? spec.default : lit(spec.default)) : null,
      identity: spec.identity === "always" ? "a" : spec.identity === "by_default" ? "d" : "",
      comment: spec.comment || null,
      is_primary_key: spec.primary_key,
      is_unique: spec.unique || spec.primary_key,
      fk_targets: spec.references ? [`${spec.references.ref_schema}.${spec.references.ref_table}`] : undefined,
    });
    if (/\(/.test(spec.type)) c.data_type = typeSQL(spec);
    return c;
  };
  switch (ch.kind) {
    case "create_table": {
      const name = ch.table!;
      const columns = (ch.columns ?? []).map(specToColumn);
      const pkCols = (ch.columns ?? []).filter((c) => c.primary_key).map((c) => c.name);
      const constraints: Constraint[] = [];
      if (pkCols.length) constraints.push(pk(name, pkCols));
      for (const u of ch.uniques ?? []) constraints.push(unique(name, u));
      for (const c of ch.columns ?? []) {
        if (c.references) constraints.push(fk(name, [c.name], c.references.ref_schema, c.references.ref_table, c.references.ref_columns, c.references.on_delete || "NO ACTION"));
        if (c.check) constraints.push(check(name, c.name, c.check));
      }
      for (const f of ch.foreign_keys ?? []) constraints.push(fk(name, f.columns, f.ref_schema, f.ref_table, f.ref_columns, f.on_delete || "NO ACTION"));
      tables.push({ table: table(schema, name, "table", "user", null, 0, 8), columns, constraints, indexes: pkCols.length ? [index(schema, name, pkCols, { primary: true })] : [], triggers: [], rows: [], seq: 1 });
      break;
    }
    case "drop_table":
      tables = tables.filter((x) => x !== t);
      break;
    case "rename_table":
      t!.table.name = ch.new_name!;
      break;
    case "add_column": {
      const c = specToColumn(ch.column!, t!.columns.length + 1);
      t!.columns.push(c);
      for (const row of t!.rows) row[c.name] = c.identity ? String(t!.seq++) : defaultValue(t!, c);
      if (ch.column!.references) t!.constraints.push(fk(t!.table.name, [c.name], ch.column!.references.ref_schema, ch.column!.references.ref_table, ch.column!.references.ref_columns, ch.column!.references.on_delete || "NO ACTION"));
      if (ch.column!.check) t!.constraints.push(check(t!.table.name, c.name, ch.column!.check));
      break;
    }
    case "drop_column":
      t!.columns = t!.columns.filter((c) => c.name !== ch.column!.name);
      for (const row of t!.rows) delete row[ch.column!.name];
      t!.constraints = t!.constraints.filter((c) => !c.columns.includes(ch.column!.name));
      break;
    case "rename_column": {
      const c = t!.columns.find((c) => c.name === ch.column!.name)!;
      const old = c.name;
      c.name = ch.new_name!;
      for (const row of t!.rows) {
        row[c.name] = row[old] ?? null;
        delete row[old];
      }
      for (const con of t!.constraints) con.columns = con.columns.map((x) => (x === old ? c.name : x));
      break;
    }
    case "alter_column": {
      const c = t!.columns.find((c) => c.name === ch.column!.name)!;
      const target = ch.column!;
      if (target.nullable !== undefined) c.is_nullable = target.nullable;
      if (target.type) {
        const next = specToColumn({ ...target, name: c.name }, c.ordinal);
        Object.assign(c, { data_type: next.data_type, type_name: next.type_name, type_schema: next.type_schema, is_array: next.is_array, enum_values: next.enum_values });
      }
      if (target.default !== undefined) c.default_expr = target.default === "" ? null : target.default_is_expr ? target.default : lit(target.default);
      if (target.identity) c.identity = target.identity === "always" ? "a" : target.identity === "by_default" ? "d" : "";
      if (target.unique) {
        c.is_unique = true;
        t!.constraints.push(unique(t!.table.name, [c.name]));
      }
      if (target.comment) c.comment = target.comment;
      break;
    }
    case "add_foreign_key":
      t!.constraints.push(fk(t!.table.name, ch.foreign_key!.columns, ch.foreign_key!.ref_schema, ch.foreign_key!.ref_table, ch.foreign_key!.ref_columns, ch.foreign_key!.on_delete || "NO ACTION"));
      for (const c of t!.columns) if (ch.foreign_key!.columns.includes(c.name)) c.fk_targets = [...(c.fk_targets ?? []), `${ch.foreign_key!.ref_schema}.${ch.foreign_key!.ref_table}`];
      break;
    case "add_unique":
      t!.constraints.push(unique(t!.table.name, ch.unique!));
      if (ch.unique!.length === 1) for (const c of t!.columns) if (c.name === ch.unique![0]) c.is_unique = true;
      break;
    case "add_check":
      t!.constraints.push({ ...check(t!.table.name, "", ch.check!), name: ch.name || `${t!.table.name}_check`, columns: [] });
      break;
    case "drop_constraint":
      t!.constraints = t!.constraints.filter((c) => c.name !== ch.constraint_name);
      break;
    case "set_primary_key":
      t!.constraints = [pk(t!.table.name, ch.primary_key!), ...t!.constraints.filter((c) => c.type !== "p")];
      for (const c of t!.columns) c.is_primary_key = ch.primary_key!.includes(c.name);
      break;
    case "comment":
      if (ch.column) t!.columns.find((c) => c.name === ch.column!.name)!.comment = ch.comment || null;
      else t!.table.comment = ch.comment || null;
      break;
    case "rls":
      t!.table.rls_enabled = Boolean(ch.enabled);
      if (ch.forced !== undefined) t!.table.rls_forced = ch.forced;
      break;
    default:
      break;
  }
}

function ddl(req: DDLRequest, apply: boolean): DDLResponse {
  const p = plan(req.change);
  const name = slug(req.name || p.summary);
  const version = String(migrationSeq).padStart(5, "0");
  const file = { path: `db/migrations/${version}_${name}.sql`, kind: "create" as const, content: render(p) };
  if (!apply) return { plan: p, file, applied: false };
  if (!req.allow_dirty) {
    // The sample repository has an uncommitted migration (the one the Database page shows pending).
    throw new DbError(500, "database_error", "the git repository has uncommitted changes; commit or stash them first, or pass --allow-dirty");
  }
  applyToCatalog(req.change);
  migrationSeq++;
  return { plan: p, file, applied: true };
}

/* ---------- The router ---------- */

function parse<T>(body: RequestInit["body"]): T {
  try {
    return JSON.parse(typeof body === "string" ? body : "{}") as T;
  } catch {
    throw new DbError(400, "invalid_json", "the body must be JSON");
  }
}

/** Answers a `/_portal/api/db/*` request, or a 404 problem. */
export function mockDbFetch(url: URL, method: string, init: RequestInit): Response {
  const p = url.pathname.slice("/_portal/api/db/".length);
  try {
    if (method === "GET") {
      if (p === "schemas") return json({ schemas });
      if (p === "tables") {
        const names = schemasOf(url);
        return json({ tables: tables.filter((t) => names.includes(t.table.schema)).map((t) => t.table) });
      }
      const m = /^tables\/([^/]+)\/([^/]+)$/.exec(p);
      if (m) return json(detail(find(decodeURIComponent(m[1]), decodeURIComponent(m[2]))));
      if (p === "types") return json({ types: types(schemasOf(url)) });
      if (p === "enums") return json({ enums: enums.filter((e) => schemasOf(url).includes(e.schema)) });
      if (p === "views") {
        const names = schemasOf(url);
        const views: View[] = tables
          .filter((t) => (t.table.kind === "view" || t.table.kind === "materialized_view") && names.includes(t.table.schema))
          .map((t) => ({ id: t.table.id, schema: t.table.schema, name: t.table.name, is_materialized: t.table.kind === "materialized_view", definition: t.definition ?? "", is_updatable: false, is_populated: null, comment: t.table.comment }));
        return json({ views });
      }
      if (p === "foreign-keys") {
        const names = schemasOf(url);
        const fks = tables
          .filter((t) => names.includes(t.table.schema))
          .flatMap((t) => t.constraints.filter((c) => c.type === "f").map((c) => ({ name: c.name, schema: t.table.schema, table: t.table.name, columns: c.columns, ref_schema: c.ref_schema, ref_table: c.ref_table, ref_columns: c.ref_columns ?? [], on_delete: c.on_delete, on_update: c.on_update })));
        return json({ foreign_keys: fks });
      }
      if (p === "functions") return json({ functions: [{ id: 30001, schema: "public", name: "touch_updated_at", language: "plpgsql", kind: "function", args: "", identity_args: "", return_type: "trigger", returns_set: false, volatility: "VOLATILE", security_definer: false, definition: "CREATE OR REPLACE FUNCTION public.touch_updated_at()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n  NEW.updated_at = now();\n  RETURN NEW;\nEND;\n$function$\n", comment: null, from_extension: false }] });
      if (p === "extensions") return json({ extensions: [{ name: "pgcrypto", default_version: "1.3", installed_version: "1.3", schema: "public", comment: "cryptographic functions", installed: true }, { name: "pg_trgm", default_version: "1.6", installed_version: null, schema: null, comment: "text similarity measurement and index searching based on trigrams", installed: false }] });
    }
    if (method === "POST") {
      if (p === "rows/query") return json(query(parse<RowQuery>(init.body)));
      if (p === "rows/insert") return json({ row: insert(parse<RowEdit>(init.body)) });
      if (p === "rows/update") return json({ row: update(parse<RowEdit>(init.body)) });
      if (p === "rows/delete") return json({ deleted: remove(parse<RowEdit>(init.body)) });
      if (p === "rows/import") return json({ inserted: importMany(parse<ImportRequest>(init.body)) });
      if (p === "ddl/plan") return json(ddl(parse<DDLRequest>(init.body), false));
      if (p === "ddl/apply") return json(ddl(parse<DDLRequest>(init.body), true));
    }
    return problem(404, "not_found", `no portal endpoint ${method} ${url.pathname}`);
  } catch (err) {
    if (err instanceof DbError) return problem(err.status, err.code, err.message);
    return problem(500, "database_error", err instanceof Error ? err.message : String(err));
  }
}
