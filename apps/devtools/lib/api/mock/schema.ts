/**
 * The mock's database: a small catalog (six tables with foreign keys, an
 * enum, a function, a trigger, a view, extensions) and a migrations list
 * that the DDL and migrate endpoints change, so the Schema, Objects and
 * Migrations pages work end to end without a backend. `mockDb` answers
 * `/_portal/api/db/*`, `/_portal/api/app/migrate*`, the `migration`
 * generator and `/_portal/app/_dev/migrations`; anything else returns
 * undefined so `mockFetch` carries on.
 */
import type { Accepted, AppStatus, DevMigrations, GeneratorResponse, Problem } from "../types";
import type { Change, DbColumn, DbEnum, DbExtension, DbFunction, DbIndex, DbSchema, DbTable, DbTrigger, DbView, DdlPlan, DdlResponse, ForeignKey, Migration, TableDetail } from "../schema";

const MUTATION_HEADER = "X-Orb-Portal";

/* ---------- Catalog ---------- */

const schemas: DbSchema[] = [
  { id: 2200, name: "public", owner: "pg_database_owner", comment: "standard public schema", system: false, has_extensions: false },
  { id: 16400, name: "billing", owner: "acme", comment: null, system: false, has_extensions: false },
  { id: 13293, name: "information_schema", owner: "acme", comment: null, system: true, has_extensions: false },
  { id: 11, name: "pg_catalog", owner: "acme", comment: "system catalog schema", system: true, has_extensions: true },
];

type ColumnSeed = Partial<DbColumn> & { name: string; data_type: string };

function col(seed: ColumnSeed, ordinal: number): DbColumn {
  return {
    ordinal,
    type_name: seed.data_type.replace(/\(.*$/, "").replace(/ .*$/, ""),
    type_schema: "pg_catalog",
    is_array: seed.data_type.endsWith("[]"),
    is_nullable: false,
    default_expr: null,
    generation_expr: null,
    identity: "",
    generated: "",
    comment: null,
    is_primary_key: false,
    is_unique: false,
    ...seed,
  };
}

const idCol: ColumnSeed = { name: "id", data_type: "bigint", identity: "a", is_primary_key: true, is_unique: true };
const stamps: ColumnSeed[] = [
  { name: "created_at", data_type: "timestamp with time zone", default_expr: "now()" },
  { name: "updated_at", data_type: "timestamp with time zone", default_expr: "now()" },
];

type TableSeed = { schema: string; name: string; ownership: DbTable["ownership"]; kind?: DbTable["kind"]; rows: number; bytes: number; comment?: string; columns: ColumnSeed[] };

const tableSeeds: TableSeed[] = [
  {
    schema: "public",
    name: "auth_users",
    ownership: "managed",
    rows: 1204,
    bytes: 425_984,
    comment: "gorbital auth: one row per person",
    columns: [idCol, { name: "email", data_type: "citext", is_unique: true }, { name: "name", data_type: "text" }, { name: "password_hash", data_type: "text", is_nullable: true }, { name: "mfa_enabled", data_type: "boolean", default_expr: "false" }, ...stamps],
  },
  {
    schema: "public",
    name: "organisations",
    ownership: "user",
    rows: 86,
    bytes: 106_496,
    columns: [idCol, { name: "slug", data_type: "text", is_unique: true }, { name: "name", data_type: "text" }, { name: "plan", data_type: "billing_plan", type_schema: "public", enum_values: ["free", "team", "enterprise"], default_expr: "'free'::billing_plan" }, { name: "owner_id", data_type: "bigint", fk_targets: ["public.auth_users"] }, ...stamps],
  },
  {
    schema: "public",
    name: "projects",
    ownership: "user",
    rows: 2318,
    bytes: 1_048_576,
    comment: "What a team works on",
    columns: [
      idCol,
      { name: "org_id", data_type: "bigint", fk_targets: ["public.organisations"] },
      { name: "name", data_type: "character varying(100)" },
      { name: "description", data_type: "text", is_nullable: true },
      { name: "status", data_type: "project_status", type_schema: "public", enum_values: ["active", "archived"], default_expr: "'active'::project_status" },
      { name: "tags", data_type: "text[]", default_expr: "'{}'::text[]" },
      { name: "archived_at", data_type: "timestamp with time zone", is_nullable: true },
      ...stamps,
    ],
  },
  {
    schema: "public",
    name: "project_members",
    ownership: "user",
    rows: 6410,
    bytes: 720_896,
    columns: [
      { name: "project_id", data_type: "bigint", is_primary_key: true, fk_targets: ["public.projects"] },
      { name: "user_id", data_type: "bigint", is_primary_key: true, fk_targets: ["public.auth_users"] },
      { name: "role", data_type: "text", default_expr: "'member'::text" },
      { name: "invited_by", data_type: "bigint", is_nullable: true, fk_targets: ["public.auth_users"] },
      stamps[0],
    ],
  },
  {
    schema: "public",
    name: "invites",
    ownership: "user",
    rows: 143,
    bytes: 90_112,
    columns: [
      idCol,
      { name: "org_id", data_type: "bigint", fk_targets: ["public.organisations"] },
      { name: "email", data_type: "citext" },
      { name: "token_hash", data_type: "bytea", is_unique: true },
      { name: "expires_at", data_type: "timestamp with time zone" },
      { name: "accepted_by", data_type: "bigint", is_nullable: true, fk_targets: ["public.auth_users"] },
      stamps[0],
    ],
  },
  {
    schema: "public",
    name: "audit_events",
    ownership: "managed",
    rows: 48_120,
    bytes: 9_437_184,
    comment: "gorbital audit: append-only",
    columns: [idCol, { name: "actor_id", data_type: "bigint", is_nullable: true, fk_targets: ["public.auth_users"] }, { name: "action", data_type: "text" }, { name: "target", data_type: "text" }, { name: "payload", data_type: "jsonb", default_expr: "'{}'::jsonb" }, stamps[0]],
  },
  {
    schema: "public",
    name: "goose_db_version",
    ownership: "system",
    rows: 13,
    bytes: 24_576,
    columns: [{ name: "id", data_type: "integer", identity: "d", is_primary_key: true, is_unique: true }, { name: "version_id", data_type: "bigint" }, { name: "is_applied", data_type: "boolean" }, { name: "tstamp", data_type: "timestamp without time zone", default_expr: "now()" }],
  },
  {
    schema: "billing",
    name: "subscriptions",
    ownership: "user",
    rows: 84,
    bytes: 65_536,
    columns: [idCol, { name: "org_id", data_type: "bigint", fk_targets: ["public.organisations"] }, { name: "plan", data_type: "billing_plan", type_schema: "public", enum_values: ["free", "team", "enterprise"] }, { name: "renews_at", data_type: "timestamp with time zone", is_nullable: true }, ...stamps],
  },
  {
    schema: "public",
    name: "active_projects",
    ownership: "user",
    kind: "view",
    rows: 0,
    bytes: 0,
    columns: [
      { name: "id", data_type: "bigint" },
      { name: "org_id", data_type: "bigint" },
      { name: "name", data_type: "character varying(100)" },
    ],
  },
];

const pretty = (b: number) => (b === 0 ? "0 bytes" : b < 1024 * 1024 ? `${Math.round(b / 1024)} kB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

const tables: DbTable[] = tableSeeds.map((s, i) => ({
  id: 16500 + i,
  schema: s.schema,
  name: s.name,
  kind: s.kind ?? "table",
  is_partition: false,
  rls_enabled: false,
  rls_forced: false,
  row_estimate: s.rows,
  live_rows: s.rows,
  bytes: s.bytes,
  size: pretty(s.bytes),
  comment: s.comment ?? null,
  owner: "acme",
  from_extension: false,
  ownership: s.ownership,
}));

const columnsOf = new Map(tableSeeds.map((s) => [`${s.schema}.${s.name}`, s.columns.map((c, i) => col(c, i + 1))]));

const foreignKeys: ForeignKey[] = [];
for (const s of tableSeeds) {
  for (const c of s.columns) {
    for (const target of c.fk_targets ?? []) {
      const [refSchema, refTable] = target.split(".");
      foreignKeys.push({ name: `${s.name}_${c.name}_fkey`, schema: s.schema, table: s.name, columns: [c.name], ref_schema: refSchema, ref_table: refTable, ref_columns: ["id"], on_delete: c.is_nullable ? "SET NULL" : "CASCADE", on_update: "NO ACTION" });
    }
  }
}

let enums: DbEnum[] = [
  { id: 17080, schema: "public", name: "project_status", values: ["active", "archived"], comment: null },
  { id: 17081, schema: "public", name: "billing_plan", values: ["free", "team", "enterprise"], comment: "What an organisation pays for" },
];

const setUpdatedAt = `CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
`;

let functions: DbFunction[] = [
  { id: 16509, schema: "public", name: "set_updated_at", language: "plpgsql", kind: "function", args: "", identity_args: "", return_type: "trigger", returns_set: false, volatility: "VOLATILE", security_definer: false, definition: setUpdatedAt, comment: "Stamps updated_at on every row change", from_extension: false },
  {
    id: 16510,
    schema: "public",
    name: "project_count",
    language: "sql",
    kind: "function",
    args: "org bigint",
    identity_args: "org bigint",
    return_type: "bigint",
    returns_set: false,
    volatility: "STABLE",
    security_definer: false,
    definition: "CREATE OR REPLACE FUNCTION public.project_count(org bigint)\n RETURNS bigint\n LANGUAGE sql\n STABLE\nAS $function$\n    SELECT count(*) FROM projects WHERE org_id = org AND status = 'active';\n$function$\n",
    comment: null,
    from_extension: false,
  },
  { id: 16511, schema: "public", name: "gen_random_uuid", language: "c", kind: "function", args: "", identity_args: "", return_type: "uuid", returns_set: false, volatility: "VOLATILE", security_definer: false, definition: null, comment: "generate a random UUID", from_extension: true },
  { id: 16512, schema: "public", name: "audit_events_reject_update", language: "plpgsql", kind: "function", args: "", identity_args: "", return_type: "trigger", returns_set: false, volatility: "VOLATILE", security_definer: true, definition: "CREATE OR REPLACE FUNCTION public.audit_events_reject_update()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nBEGIN\n    RAISE EXCEPTION 'audit events are append-only';\nEND;\n$function$\n", comment: null, from_extension: false },
];

const triggersOf = new Map<string, DbTrigger[]>([
  ["public.projects", [{ id: 16600, name: "projects_set_updated_at", definition: "CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION set_updated_at()", enabled: "origin", timing: "BEFORE", orientation: "ROW", events: ["UPDATE"], function_schema: "public", function_name: "set_updated_at" }]],
  ["public.organisations", [{ id: 16601, name: "organisations_set_updated_at", definition: "CREATE TRIGGER organisations_set_updated_at BEFORE UPDATE ON public.organisations FOR EACH ROW EXECUTE FUNCTION set_updated_at()", enabled: "origin", timing: "BEFORE", orientation: "ROW", events: ["UPDATE"], function_schema: "public", function_name: "set_updated_at" }]],
  ["public.audit_events", [{ id: 16602, name: "audit_events_append_only", definition: "CREATE TRIGGER audit_events_append_only BEFORE DELETE OR UPDATE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION audit_events_reject_update()", enabled: "origin", timing: "BEFORE", orientation: "ROW", events: ["DELETE", "UPDATE"], function_schema: "public", function_name: "audit_events_reject_update" }]],
]);

const indexesOf = new Map<string, DbIndex[]>();
for (const s of tableSeeds) {
  if (s.kind === "view") continue;
  const pk = s.columns.filter((c) => c.is_primary_key).map((c) => c.name);
  const list: DbIndex[] = [];
  if (pk.length) list.push({ id: 16700 + list.length, name: `${s.name}_pkey`, definition: `CREATE UNIQUE INDEX ${s.name}_pkey ON ${s.schema}.${s.name} USING btree (${pk.join(", ")})`, method: "btree", is_unique: true, is_primary: true, is_valid: true, is_partial: false, columns: pk, bytes: 16_384, scans: s.rows * 3, last_scan: new Date(Date.now() - 60_000).toISOString() });
  for (const c of s.columns) {
    if (c.is_unique && !c.is_primary_key) list.push({ id: 16700 + list.length, name: `${s.name}_${c.name}_key`, definition: `CREATE UNIQUE INDEX ${s.name}_${c.name}_key ON ${s.schema}.${s.name} USING btree (${c.name})`, method: "btree", is_unique: true, is_primary: false, is_valid: true, is_partial: false, columns: [c.name], bytes: 16_384, scans: 12, last_scan: new Date(Date.now() - 3_600_000).toISOString() });
    if (c.fk_targets) list.push({ id: 16700 + list.length, name: `${s.name}_${c.name}_idx`, definition: `CREATE INDEX ${s.name}_${c.name}_idx ON ${s.schema}.${s.name} USING btree (${c.name})`, method: "btree", is_unique: false, is_primary: false, is_valid: true, is_partial: false, columns: [c.name], bytes: 8192, scans: c.name === "invited_by" ? 0 : 340, last_scan: c.name === "invited_by" ? null : new Date(Date.now() - 120_000).toISOString() });
  }
  if (s.name === "projects") list.push({ id: 16790, name: "projects_tags_gin", definition: "CREATE INDEX projects_tags_gin ON public.projects USING gin (tags)", method: "gin", is_unique: false, is_primary: false, is_valid: true, is_partial: false, columns: ["tags"], bytes: 32_768, scans: 0, last_scan: null }, { id: 16791, name: "projects_active_idx", definition: "CREATE INDEX projects_active_idx ON public.projects USING btree (org_id) WHERE (status = 'active'::project_status)", method: "btree", is_unique: false, is_primary: false, is_valid: true, is_partial: true, columns: ["org_id"], bytes: 16_384, scans: 88, last_scan: new Date(Date.now() - 30_000).toISOString() });
  indexesOf.set(`${s.schema}.${s.name}`, list);
}

let views: DbView[] = [
  { id: 16800, schema: "public", name: "active_projects", is_materialized: false, definition: " SELECT id,\n    org_id,\n    name\n   FROM projects\n  WHERE (status = 'active'::project_status);", is_updatable: true, is_populated: null, comment: null },
  { id: 16801, schema: "billing", name: "mrr_by_plan", is_materialized: true, definition: " SELECT plan,\n    count(*) AS orgs\n   FROM subscriptions\n  GROUP BY plan;", is_updatable: false, is_populated: true, comment: "Refreshed nightly by billing.rollup" },
];

let extensions: DbExtension[] = [
  { name: "plpgsql", default_version: "1.0", installed_version: "1.0", schema: "pg_catalog", comment: "PL/pgSQL procedural language", installed: true },
  { name: "citext", default_version: "1.6", installed_version: "1.6", schema: "public", comment: "data type for case-insensitive character strings", installed: true },
  { name: "pgcrypto", default_version: "1.3", installed_version: "1.3", schema: "public", comment: "cryptographic functions", installed: true },
  { name: "pg_trgm", default_version: "1.6", installed_version: null, schema: null, comment: "text similarity measurement and index searching based on trigrams", installed: false },
  { name: "uuid-ossp", default_version: "1.1", installed_version: null, schema: null, comment: "generate universally unique identifiers (UUIDs)", installed: false },
  { name: "pg_stat_statements", default_version: "1.11", installed_version: null, schema: null, comment: "track planning and execution statistics of all SQL statements executed", installed: false },
  { name: "btree_gin", default_version: "1.3", installed_version: null, schema: null, comment: "support for indexing common datatypes in GIN", installed: false },
  { name: "hstore", default_version: "1.8", installed_version: null, schema: null, comment: "data type for storing sets of (key, value) pairs", installed: false },
  { name: "postgis", default_version: "3.5.2", installed_version: null, schema: null, comment: "PostGIS geometry and geography spatial types and functions", installed: false },
];

/* ---------- Migrations ---------- */

const day = 86_400_000;
const base = Date.parse("2026-09-01T09:00:00Z");
const file = (version: number, name: string, up: string, down?: string) => ({
  version,
  name,
  path: `db/migrations/${version}_${name}.sql`,
  sql: `-- ${name.replace(/_/g, " ")}.\n\n-- +goose Up\n${up}\n${down !== undefined ? `\n-- +goose Down\n${down}\n` : ""}`,
  has_down: down !== undefined,
});

const seedMigrations = [
  file(20260901000001, "auth", "CREATE TABLE auth_users (\n    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n    email citext NOT NULL UNIQUE,\n    name text NOT NULL,\n    password_hash text,\n    mfa_enabled boolean NOT NULL DEFAULT false,\n    created_at timestamptz NOT NULL DEFAULT now(),\n    updated_at timestamptz NOT NULL DEFAULT now()\n);"),
  file(20260901000002, "audit_events", "CREATE TABLE audit_events (\n    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n    actor_id bigint REFERENCES auth_users(id) ON DELETE SET NULL,\n    action text NOT NULL,\n    target text NOT NULL,\n    payload jsonb NOT NULL DEFAULT '{}',\n    created_at timestamptz NOT NULL DEFAULT now()\n);"),
  file(20260902000001, "organisations", "CREATE TYPE billing_plan AS ENUM ('free', 'team', 'enterprise');\n\nCREATE TABLE organisations (\n    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n    slug text NOT NULL UNIQUE,\n    name text NOT NULL,\n    plan billing_plan NOT NULL DEFAULT 'free',\n    owner_id bigint NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,\n    created_at timestamptz NOT NULL DEFAULT now(),\n    updated_at timestamptz NOT NULL DEFAULT now()\n);", "DROP TABLE organisations;\nDROP TYPE billing_plan;"),
  file(20260903000001, "projects", "CREATE TYPE project_status AS ENUM ('active', 'archived');\n\nCREATE TABLE projects (\n    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n    org_id bigint NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,\n    name varchar(100) NOT NULL,\n    description text,\n    status project_status NOT NULL DEFAULT 'active',\n    tags text[] NOT NULL DEFAULT '{}',\n    created_at timestamptz NOT NULL DEFAULT now(),\n    updated_at timestamptz NOT NULL DEFAULT now()\n);", "DROP TABLE projects;\nDROP TYPE project_status;"),
  file(20260903000002, "project_members", "CREATE TABLE project_members (\n    project_id bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,\n    user_id bigint NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,\n    role text NOT NULL DEFAULT 'member',\n    invited_by bigint REFERENCES auth_users(id) ON DELETE SET NULL,\n    created_at timestamptz NOT NULL DEFAULT now(),\n    PRIMARY KEY (project_id, user_id)\n);", "DROP TABLE project_members;"),
  file(20260905000001, "invites", "CREATE TABLE invites (\n    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n    org_id bigint NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,\n    email citext NOT NULL,\n    token_hash bytea NOT NULL UNIQUE,\n    expires_at timestamptz NOT NULL,\n    accepted_by bigint REFERENCES auth_users(id) ON DELETE SET NULL,\n    created_at timestamptz NOT NULL DEFAULT now()\n);", "DROP TABLE invites;"),
  file(20260908000001, "set_updated_at", "CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$\nBEGIN\n    NEW.updated_at = now();\n    RETURN NEW;\nEND;\n$$;\n\nCREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();\nCREATE TRIGGER organisations_set_updated_at BEFORE UPDATE ON organisations FOR EACH ROW EXECUTE FUNCTION set_updated_at();", "DROP TRIGGER organisations_set_updated_at ON organisations;\nDROP TRIGGER projects_set_updated_at ON projects;\nDROP FUNCTION set_updated_at();"),
  file(20260910000001, "billing", "CREATE SCHEMA billing;\n\nCREATE TABLE billing.subscriptions (\n    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n    org_id bigint NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,\n    plan billing_plan NOT NULL,\n    renews_at timestamptz,\n    created_at timestamptz NOT NULL DEFAULT now(),\n    updated_at timestamptz NOT NULL DEFAULT now()\n);\n\nCREATE MATERIALIZED VIEW billing.mrr_by_plan AS\nSELECT plan, count(*) AS orgs FROM billing.subscriptions GROUP BY plan;", "DROP MATERIALIZED VIEW billing.mrr_by_plan;\nDROP TABLE billing.subscriptions;\nDROP SCHEMA billing;"),
  file(20260912000001, "projects_archived_at", "ALTER TABLE projects ADD COLUMN archived_at timestamptz;", "ALTER TABLE projects DROP COLUMN archived_at;"),
  file(20260914000001, "active_projects_view", "CREATE VIEW active_projects AS\nSELECT id, org_id, name FROM projects WHERE status = 'active';", "DROP VIEW active_projects;"),
  file(20260915000001, "projects_tags_gin", "-- +goose NO TRANSACTION\nCREATE INDEX CONCURRENTLY projects_tags_gin ON projects USING gin (tags);", "DROP INDEX CONCURRENTLY projects_tags_gin;"),
  file(20260916000001, "projects_search_tsvector", "ALTER TABLE projects ADD COLUMN search tsvector GENERATED ALWAYS AS (to_tsvector('simple', name || ' ' || coalesce(description, ''))) STORED;\nCREATE INDEX projects_search_idx ON projects USING gin (search);", "ALTER TABLE projects DROP COLUMN search;"),
];

const initialMigrations = (): Migration[] => seedMigrations.map((m, i) => ({ ...m, applied: i < seedMigrations.length - 1, applied_at: i < seedMigrations.length - 1 ? new Date(base + i * day + 3_600_000).toISOString() : null }));

let migrations: Migration[] = initialMigrations();
let nextVersionCounter = 0;

/** Resets the mock database to its first state; tests call it between cases. */
export function resetMockDb() {
  migrations = initialMigrations();
  nextVersionCounter = 0;
  enums = enums.filter((e) => e.id < 20000);
  functions = functions.filter((f) => f.id < 20000);
  views = views.filter((v) => v.id < 20000);
  extensions = extensions.map((e) => (e.name === "pg_trgm" || e.name === "uuid-ossp" || e.name === "pg_stat_statements" || e.name === "btree_gin" || e.name === "hstore" || e.name === "postgis" ? { ...e, installed: false, installed_version: null, schema: null } : e));
  pendingEffects.clear();
}

function nextVersion(): number {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return Number(`${stamp}${String(++nextVersionCounter + 100).padStart(6, "0")}`);
}

/* ---------- Plans (a small mirror of pgmeta.Plan) ---------- */

const ident = (s: string) => (/^[a-z_][a-z0-9_]*$/.test(s) ? s : `"${s.replace(/"/g, '""')}"`);
const qual = (schema: string, name: string) => `${ident(schema)}.${ident(name)}`;
const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;
const identPat = /^[A-Za-z_][A-Za-z0-9_]*$/;

class PlanError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    detail: string,
  ) {
    super(detail);
  }
}

const invalid = (detail: string) => new PlanError(422, "invalid_input", detail);
const trimSemi = (s: string) => s.trim().replace(/;+$/, "");

function checkIdent(kind: string, name: string | undefined): string {
  if (!name || !identPat.test(name) || name.length > 63) throw invalid(`${kind} ${JSON.stringify(name ?? "")} must be letters, digits and underscores, starting with a letter`);
  return name;
}

function tableOf(ch: Change): DbTable | undefined {
  return tables.find((t) => t.schema === ch.schema && t.name === ch.table);
}

/** Refuses managed and system tables the way the portal does (403 system_table). */
function requireUserTable(ch: Change): DbTable {
  const t = tableOf(ch);
  if (!t) throw new PlanError(404, "not_found", `${ch.schema}.${ch.table} isn't a table`);
  if (t.ownership !== "user") throw new PlanError(403, "system_table", `${t.schema}.${t.name} is a ${t.ownership} table; its schema belongs to ${t.ownership === "managed" ? "the framework's migrations" : "the tool that owns it"}`);
  return t;
}

/** Renders a change as Up/Down SQL, mirroring `pgmeta.Plan` for the kinds this phase uses. */
export function planChange(ch: Change): DdlPlan {
  const p: DdlPlan = { summary: "", up: [], down: [], irreversible: false, notes: [] };
  switch (ch.kind) {
    case "create_extension": {
      const n = checkIdent("extension", ch.name);
      p.summary = `Create extension ${n}`;
      p.up = [`CREATE EXTENSION IF NOT EXISTS ${ident(n)};`];
      p.down = [`DROP EXTENSION IF EXISTS ${ident(n)};`];
      break;
    }
    case "drop_extension": {
      const n = checkIdent("extension", ch.name);
      p.summary = `Drop extension ${n}`;
      p.up = [`DROP EXTENSION IF EXISTS ${ident(n)};`];
      p.down = [`CREATE EXTENSION IF NOT EXISTS ${ident(n)};`];
      p.notes = ["dropping an extension drops what it created; objects that depend on it stop the drop"];
      break;
    }
    case "create_function": {
      const n = checkIdent("function", ch.name);
      if (!/^create/i.test((ch.definition ?? "").trim())) throw invalid("the definition is the whole CREATE FUNCTION statement");
      if (!ch.signature) throw invalid("create_function needs the signature, such as name(text, integer)");
      p.summary = `Create function ${n}`;
      p.up = [`${trimSemi(ch.definition ?? "")};`];
      p.down = [`DROP FUNCTION IF EXISTS ${ident(ch.schema)}.${ch.signature};`];
      break;
    }
    case "drop_function": {
      if (!ch.signature) throw invalid("drop_function needs the signature, such as name(text, integer)");
      p.summary = `Drop function ${ch.signature}`;
      p.up = [`DROP FUNCTION ${ident(ch.schema)}.${ch.signature};`];
      if (ch.definition) p.down = [`${trimSemi(ch.definition)};`];
      else {
        p.irreversible = true;
        p.notes = ["the function's definition wasn't given; recreate it by hand"];
      }
      break;
    }
    case "create_trigger": {
      const n = checkIdent("trigger", ch.name);
      const t = checkIdent("table", ch.table);
      requireUserTable(ch);
      if (!/^create/i.test((ch.definition ?? "").trim())) throw invalid("the definition is the whole CREATE TRIGGER statement");
      p.summary = `Create trigger ${n} on ${t}`;
      p.up = [`${trimSemi(ch.definition ?? "")};`];
      p.down = [`DROP TRIGGER IF EXISTS ${ident(n)} ON ${qual(ch.schema, t)};`];
      break;
    }
    case "drop_trigger": {
      const n = checkIdent("trigger", ch.name);
      const t = checkIdent("table", ch.table);
      requireUserTable(ch);
      p.summary = `Drop trigger ${n} on ${t}`;
      p.up = [`DROP TRIGGER ${ident(n)} ON ${qual(ch.schema, t)};`];
      if (ch.definition) p.down = [`${trimSemi(ch.definition)};`];
      else {
        p.irreversible = true;
        p.notes = ["the trigger's definition wasn't given; recreate it by hand"];
      }
      break;
    }
    case "create_view": {
      const n = checkIdent("view", ch.name);
      if (!(ch.definition ?? "").trim()) throw invalid("create_view needs the SELECT it is defined as");
      const kind = ch.materialized ? "MATERIALIZED VIEW" : "VIEW";
      p.summary = `Create view ${n}`;
      p.up = [`CREATE ${kind} ${qual(ch.schema, n)} AS\n${trimSemi(ch.definition ?? "")};`];
      p.down = [`DROP ${kind} ${qual(ch.schema, n)};`];
      break;
    }
    case "drop_view": {
      const n = checkIdent("view", ch.name);
      const kind = ch.materialized ? "MATERIALIZED VIEW" : "VIEW";
      p.summary = `Drop view ${n}`;
      p.up = [`DROP ${kind} ${qual(ch.schema, n)};`];
      if (ch.definition) p.down = [`CREATE ${kind} ${qual(ch.schema, n)} AS\n${trimSemi(ch.definition)};`];
      else {
        p.irreversible = true;
        p.notes = ["the view's definition wasn't given; recreate it by hand"];
      }
      break;
    }
    case "create_enum": {
      const n = checkIdent("type", ch.name);
      if (!ch.values?.length) throw invalid("an enum needs values");
      p.summary = `Create enum ${n}`;
      p.up = [`CREATE TYPE ${qual(ch.schema, n)} AS ENUM (${ch.values.map(literal).join(", ")});`];
      p.down = [`DROP TYPE ${qual(ch.schema, n)};`];
      break;
    }
    case "add_enum_value": {
      const n = checkIdent("type", ch.name);
      if (!ch.value) throw invalid("add_enum_value needs a value");
      p.summary = `Add ${ch.value} to enum ${n}`;
      p.up = [`ALTER TYPE ${qual(ch.schema, n)} ADD VALUE IF NOT EXISTS ${literal(ch.value)}${ch.after ? ` AFTER ${literal(ch.after)}` : ""};`];
      p.irreversible = true;
      p.notes = ["PostgreSQL can't remove a value from an enum; recreate the type to drop it"];
      p.no_transaction = true;
      break;
    }
    case "rename_enum_value": {
      const n = checkIdent("type", ch.name);
      if (!ch.value || !ch.new_name) throw invalid("rename_enum_value needs the old and new values");
      p.summary = `Rename ${ch.value} to ${ch.new_name} in enum ${n}`;
      p.up = [`ALTER TYPE ${qual(ch.schema, n)} RENAME VALUE ${literal(ch.value)} TO ${literal(ch.new_name)};`];
      p.down = [`ALTER TYPE ${qual(ch.schema, n)} RENAME VALUE ${literal(ch.new_name)} TO ${literal(ch.value)};`];
      break;
    }
    case "drop_enum": {
      const n = checkIdent("type", ch.name);
      const e = enums.find((x) => x.schema === ch.schema && x.name === n);
      if (!e) throw new PlanError(404, "not_found", `enum ${n}`);
      p.summary = `Drop enum ${n}`;
      p.up = [`DROP TYPE ${qual(ch.schema, n)};`];
      p.down = [`CREATE TYPE ${qual(ch.schema, n)} AS ENUM (${e.values.map(literal).join(", ")});`];
      break;
    }
    case "create_index": {
      const t = checkIdent("table", ch.table);
      requireUserTable(ch);
      if (!ch.index?.columns.length) throw invalid("create_index needs columns");
      const method = (ch.index.method ?? "").toLowerCase();
      if (!["", "btree", "hash", "gin", "gist", "brin", "spgist"].includes(method)) throw invalid(`unknown index method ${JSON.stringify(ch.index.method)}`);
      const cols = ch.index.columns.map((c) => (c.startsWith("(") ? c : ident(checkIdent("column", c))));
      const plain = ch.index.columns.map((c) => (c.startsWith("(") ? "expr" : c));
      const name = checkIdent("index", ch.index.name || `${t}_${plain.join("_")}_idx`);
      let sql = `CREATE ${ch.index.unique ? "UNIQUE " : ""}INDEX ${ch.index.concurrently ? "CONCURRENTLY " : ""}${ident(name)} ON ${qual(ch.schema, t)}`;
      if (method) sql += ` USING ${method}`;
      sql += ` (${cols.join(", ")})`;
      if (ch.index.where?.trim()) sql += ` WHERE ${ch.index.where}`;
      p.summary = `Create index ${name} on ${t}`;
      p.up = [`${sql};`];
      p.down = [`DROP INDEX ${ch.index.concurrently ? "CONCURRENTLY " : ""}${qual(ch.schema, name)};`];
      if (ch.index.concurrently) p.no_transaction = true;
      break;
    }
    case "drop_index": {
      const n = checkIdent("index", ch.index_name);
      requireUserTable(ch);
      const current = indexesOf.get(`${ch.schema}.${ch.table}`)?.find((i) => i.name === n);
      if (!current) throw new PlanError(404, "not_found", `index ${n}`);
      if (current.is_primary) throw invalid("drop the primary key constraint instead");
      p.summary = `Drop index ${n}`;
      p.up = [`DROP INDEX ${qual(ch.schema, n)};`];
      p.down = [`${current.definition};`];
      break;
    }
    default:
      throw invalid(`the mock plans object changes only; ${ch.kind} isn't one`);
  }
  if (!p.notes?.length) delete p.notes;
  return p;
}

/** The migration file `pgmeta.Render` writes for a plan. */
export function renderPlan(p: DdlPlan): string {
  let s = `-- ${p.summary}.\n--\n-- Written by the Dev Portal. Change this migration freely until it is\n-- released; afterwards, add a new one.\n\n`;
  for (const n of p.notes ?? []) s += `-- ${n}\n`;
  if (p.notes?.length) s += "\n";
  if (p.no_transaction) s += "-- +goose NO TRANSACTION\n";
  s += `-- +goose Up\n${p.up.join("\n")}\n`;
  if (p.down.length) s += `\n-- +goose Down\n${p.down.join("\n")}\n`;
  return s;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);

/** What applying a change does to the catalog once the migration runs. */
const pendingEffects = new Map<number, () => void>();

function effectOf(ch: Change): () => void {
  const id = 20000 + Math.floor(Math.random() * 10000);
  switch (ch.kind) {
    case "create_extension":
      return () => (extensions = extensions.map((e) => (e.name === ch.name ? { ...e, installed: true, installed_version: e.default_version, schema: "public" } : e)));
    case "drop_extension":
      return () => (extensions = extensions.map((e) => (e.name === ch.name ? { ...e, installed: false, installed_version: null, schema: null } : e)));
    case "create_enum":
      return () => enums.push({ id, schema: ch.schema, name: ch.name ?? "", values: ch.values ?? [], comment: null });
    case "add_enum_value":
      return () =>
        (enums = enums.map((e) => {
          if (e.name !== ch.name || e.schema !== ch.schema) return e;
          const values = [...e.values];
          const at = ch.after ? values.indexOf(ch.after) + 1 : values.length;
          values.splice(at > 0 ? at : values.length, 0, ch.value ?? "");
          return { ...e, values };
        }));
    case "rename_enum_value":
      return () => (enums = enums.map((e) => (e.name === ch.name && e.schema === ch.schema ? { ...e, values: e.values.map((v) => (v === ch.value ? (ch.new_name ?? v) : v)) } : e)));
    case "drop_enum":
      return () => (enums = enums.filter((e) => !(e.name === ch.name && e.schema === ch.schema)));
    case "create_function": {
      const sig = ch.signature ?? "";
      const args = sig.slice(sig.indexOf("(") + 1, sig.lastIndexOf(")"));
      const ret = /RETURNS\s+([^\s]+)/i.exec(ch.definition ?? "")?.[1] ?? "void";
      const lang = /LANGUAGE\s+([a-z]+)/i.exec(ch.definition ?? "")?.[1] ?? "plpgsql";
      return () => functions.push({ id, schema: ch.schema, name: ch.name ?? "", language: lang, kind: "function", args, identity_args: args, return_type: ret, returns_set: false, volatility: "VOLATILE", security_definer: /SECURITY DEFINER/i.test(ch.definition ?? ""), definition: ch.definition ?? null, comment: null, from_extension: false });
    }
    case "drop_function":
      return () => (functions = functions.filter((f) => !(f.schema === ch.schema && `${f.name}(${f.identity_args})` === ch.signature)));
    case "create_trigger":
      return () => {
        const key = `${ch.schema}.${ch.table}`;
        const d = ch.definition ?? "";
        const list = triggersOf.get(key) ?? [];
        list.push({
          id,
          name: ch.name ?? "",
          definition: trimSemi(d),
          enabled: "origin",
          timing: /INSTEAD OF/i.test(d) ? "INSTEAD OF" : /BEFORE/i.test(d) ? "BEFORE" : "AFTER",
          orientation: /FOR EACH ROW/i.test(d) ? "ROW" : "STATEMENT",
          events: ["INSERT", "UPDATE", "DELETE", "TRUNCATE"].filter((e) => new RegExp(`\\b${e}\\b`, "i").test(d.replace(/EXECUTE.*$/i, ""))),
          function_schema: ch.schema,
          function_name: /EXECUTE (?:FUNCTION|PROCEDURE)\s+(?:[a-z_]+\.)?([a-z_0-9]+)/i.exec(d)?.[1] ?? "",
        });
        triggersOf.set(key, list);
      };
    case "drop_trigger":
      return () => {
        const key = `${ch.schema}.${ch.table}`;
        triggersOf.set(key, (triggersOf.get(key) ?? []).filter((t) => t.name !== ch.name));
      };
    case "create_view":
      return () => views.push({ id, schema: ch.schema, name: ch.name ?? "", is_materialized: Boolean(ch.materialized), definition: ` ${trimSemi(ch.definition ?? "")};`, is_updatable: !ch.materialized, is_populated: ch.materialized ? true : null, comment: null });
    case "drop_view":
      return () => (views = views.filter((v) => !(v.schema === ch.schema && v.name === ch.name)));
    case "create_index":
      return () => {
        const key = `${ch.schema}.${ch.table}`;
        const list = indexesOf.get(key) ?? [];
        const name = ch.index?.name || `${ch.table}_${(ch.index?.columns ?? []).map((c) => (c.startsWith("(") ? "expr" : c)).join("_")}_idx`;
        list.push({ id, name, definition: planChange(ch).up[0]?.replace(/;$/, "") ?? "", method: ch.index?.method || "btree", is_unique: Boolean(ch.index?.unique), is_primary: false, is_valid: true, is_partial: Boolean(ch.index?.where), columns: ch.index?.columns ?? [], bytes: 8192, scans: 0, last_scan: null });
        indexesOf.set(key, list);
      };
    case "drop_index":
      return () => {
        const key = `${ch.schema}.${ch.table}`;
        indexesOf.set(key, (indexesOf.get(key) ?? []).filter((i) => i.name !== ch.index_name));
      };
    default:
      return () => {};
  }
}

/* ---------- The migrate commands ---------- */

let busy = false;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runMigrate(mode: "up" | "down" | "redo") {
  busy = true;
  await wait(1500);
  const apply = (m: Migration) => {
    m.applied = true;
    m.applied_at = new Date().toISOString();
    pendingEffects.get(m.version)?.();
    pendingEffects.delete(m.version);
  };
  const unapply = (m: Migration) => {
    m.applied = false;
    m.applied_at = null;
  };
  if (mode === "up") migrations.filter((m) => !m.applied).forEach(apply);
  else {
    const last = [...migrations].reverse().find((m) => m.applied);
    if (last) {
      unapply(last);
      if (mode === "redo") {
        await wait(400);
        migrations.filter((m) => !m.applied).forEach(apply);
      }
    }
  }
  busy = false;
}

/* ---------- Responses ---------- */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function problem(status: number, code: string, detail: string): Response {
  const titles: Record<number, string> = { 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 409: "Conflict", 422: "Unprocessable Entity", 503: "Service Unavailable" };
  const p: Problem = { title: titles[status] ?? "Error", status, code, detail };
  return new Response(JSON.stringify(p), { status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } });
}

function schemasParam(url: URL): string[] {
  const q = url.searchParams.getAll("schema");
  return q.length ? q : schemas.filter((s) => !s.system).map((s) => s.name);
}

function detail(schema: string, table: string): TableDetail | undefined {
  const t = tables.find((x) => x.schema === schema && x.name === table);
  if (!t) return undefined;
  const key = `${schema}.${table}`;
  const columns = columnsOf.get(key) ?? [];
  const fks = foreignKeys.filter((f) => f.schema === schema && f.table === table);
  return {
    table: t,
    columns,
    constraints: [
      ...(columns.some((c) => c.is_primary_key) ? [{ id: t.id * 10, name: `${table}_pkey`, type: "p" as const, definition: `PRIMARY KEY (${columns.filter((c) => c.is_primary_key).map((c) => c.name).join(", ")})`, deferrable: false, deferred: false, validated: true, columns: columns.filter((c) => c.is_primary_key).map((c) => c.name), ref_schema: null, ref_table: null, on_delete: null, on_update: null }] : []),
      ...fks.map((f, i) => ({ id: t.id * 10 + 1 + i, name: f.name, type: "f" as const, definition: `FOREIGN KEY (${f.columns.join(", ")}) REFERENCES ${f.ref_table}(${f.ref_columns.join(", ")}) ON DELETE ${f.on_delete}`, deferrable: false, deferred: false, validated: true, columns: f.columns, ref_schema: f.ref_schema, ref_table: f.ref_table, ref_columns: f.ref_columns, on_delete: f.on_delete, on_update: f.on_update })),
    ],
    indexes: indexesOf.get(key) ?? [],
    triggers: triggersOf.get(key) ?? [],
    primary_key: columns.filter((c) => c.is_primary_key).map((c) => c.name),
  };
}

function parseBody<T>(body: BodyInit | null | undefined): T | undefined {
  try {
    return JSON.parse(typeof body === "string" ? body : "{}") as T;
  } catch {
    return undefined;
  }
}

/**
 * Answers the database, migrate and migration-generator endpoints of the
 * mock portal, or undefined when `url` is none of them. `app` is the mock
 * supervisor's status, echoed in the 202 answers.
 */
export async function mockDb(url: URL, method: string, init: RequestInit, app: AppStatus): Promise<Response | undefined> {
  const p = url.pathname;
  const headers = new Headers(init.headers);
  if (method !== "GET" && method !== "HEAD" && !headers.has(MUTATION_HEADER)) return undefined;

  if (p === "/_portal/app/_dev/migrations") {
    const applied = migrations.filter((m) => m.applied);
    return json({ current: applied.length ? Math.max(...applied.map((m) => m.version)) : 0, latest: migrations.length ? Math.max(...migrations.map((m) => m.version)) : 0, pending: migrations.filter((m) => !m.applied).length } satisfies DevMigrations);
  }

  const migrate = /^\/_portal\/api\/app\/(migrate|migrate-down|migrate-redo)$/.exec(p);
  if (migrate && method === "POST") {
    if (busy) return problem(409, "app_action_failed", "orb dev is still handling the previous request; try again in a moment");
    void runMigrate(migrate[1] === "migrate" ? "up" : migrate[1] === "migrate-down" ? "down" : "redo");
    return json({ accepted: true, app } satisfies Accepted, 202);
  }

  const gen = /^\/_portal\/api\/generators\/migration\/(plan|apply)$/.exec(p);
  if (gen && method === "POST") {
    const body = parseBody<{ input?: { name?: string } }>(init.body);
    const name = slug(body?.input?.name ?? "");
    if (!name) return problem(422, "invalid_input", "the migration needs a name");
    const version = nextVersion();
    const path = `db/migrations/${version}_${name}.sql`;
    const content = `-- ${name.replace(/_/g, " ")}.\n\n-- +goose Up\n\n-- +goose Down\n`;
    if (gen[1] === "apply") migrations.push({ version, name, path, sql: content, applied: false, applied_at: null, has_down: true });
    return json({ applied: gen[1] === "apply", plan: { generator: "migration", name, summary: `${gen[1] === "apply" ? "Wrote" : "Would write"} ${path}`, changes: [{ path, kind: "create", content }], next: ["write the SQL under +goose Up (and its undo under +goose Down)", "apply it from the Migrations page or with orb dev"] } } satisfies GeneratorResponse);
  }

  if (!p.startsWith("/_portal/api/db/")) return undefined;
  const rest = p.slice("/_portal/api/db/".length);

  if (method === "GET") {
    const wanted = schemasParam(url);
    switch (rest) {
      case "schemas":
        return json({ schemas });
      case "tables":
        return json({ tables: tables.filter((t) => wanted.includes(t.schema)) });
      case "foreign-keys":
        return json({ foreign_keys: foreignKeys.filter((f) => wanted.includes(f.schema)) });
      case "enums":
        return json({ enums: enums.filter((e) => wanted.includes(e.schema)) });
      case "functions":
        return json({ functions: functions.filter((f) => wanted.includes(f.schema)) });
      case "views":
        return json({ views: views.filter((v) => wanted.includes(v.schema)) });
      case "extensions":
        return json({ extensions });
      case "migrations":
        return json({ migrations: [...migrations].sort((a, b) => a.version - b.version) });
    }
    const t = /^tables\/([^/]+)\/([^/]+)$/.exec(rest);
    if (t) {
      const d = detail(decodeURIComponent(t[1]), decodeURIComponent(t[2]));
      return d ? json(d) : problem(404, "not_found", `no table ${t[1]}.${t[2]}`);
    }
    return undefined; // the SQL editor's and the Table Editor's reads (mock/sql.ts, mock/db.ts) come next
  }

  const ddl = /^ddl\/(plan|apply)$/.exec(rest);
  if (ddl && method === "POST") {
    const body = parseBody<{ change?: Change; name?: string; allow_dirty?: boolean }>(init.body);
    if (!body?.change) return problem(400, "invalid_json", "the body must be JSON with a change");
    let plan: DdlPlan;
    try {
      plan = planChange(body.change);
    } catch (err) {
      if (err instanceof PlanError) return problem(err.status, err.code, err.message);
      throw err;
    }
    const version = nextVersion();
    const name = slug(body.name ?? "") || slug(plan.summary);
    const file = { path: `db/migrations/${version}_${name}.sql`, kind: "create" as const, content: renderPlan(plan) };
    if (ddl[1] === "plan") return json({ plan, file, applied: false } satisfies DdlResponse);
    if (!body.allow_dirty) return problem(409, "plan_conflict", "the git working tree has uncommitted changes; commit them or allow uncommitted changes");
    if (busy) return problem(409, "app_action_failed", "orb dev is still handling the previous request; try again in a moment");
    migrations.push({ version, name, path: file.path, sql: file.content, applied: false, applied_at: null, has_down: plan.down.length > 0 });
    pendingEffects.set(version, effectOf(body.change));
    void runMigrate("up");
    return json({ plan, file, applied: true } satisfies DdlResponse);
  }
  return undefined; // the SQL editor's and the Table Editor's writes (mock/sql.ts, mock/db.ts) come next
}
