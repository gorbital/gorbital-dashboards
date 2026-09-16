import { describe, expect, it } from "vitest";
import { changes, signatureFromDefinition, signatureOf, nameFromDefinition } from "@/components/db-objects/changes";
import { badgesFor, formatVersion, newestFirst, splitSections, summarise } from "@/components/migrations/migrations";
import { buildGraph, edgeId, handleId, layoutGraph, mermaidType, neighbourhood, nodeHeight, nodeId, toMermaid, NODE_WIDTH } from "@/components/schema/graph";
import { migrationsFingerprint, schemaQuery } from "./schema";
import type { DbColumn, DbFunction, DbTable, DbView, ForeignKey, Migration, TableDetail } from "./schema";

/* ---------- Fixtures ---------- */

const table = (schema: string, name: string, ownership: DbTable["ownership"] = "user"): DbTable => ({
  id: name.length,
  schema,
  name,
  kind: "table",
  is_partition: false,
  rls_enabled: false,
  rls_forced: false,
  row_estimate: 0,
  live_rows: 0,
  bytes: 0,
  size: "0 bytes",
  comment: null,
  owner: "acme",
  from_extension: false,
  ownership,
});

const column = (name: string, data_type: string, extra: Partial<DbColumn> = {}): DbColumn => ({
  ordinal: 1,
  name,
  data_type,
  type_name: data_type,
  type_schema: "pg_catalog",
  is_array: false,
  is_nullable: false,
  default_expr: null,
  generation_expr: null,
  identity: "",
  generated: "",
  comment: null,
  is_primary_key: false,
  is_unique: false,
  ...extra,
});

const detail = (t: DbTable, columns: DbColumn[]): TableDetail => ({ table: t, columns, constraints: [], indexes: [], triggers: [], primary_key: columns.filter((c) => c.is_primary_key).map((c) => c.name) });

const users = table("public", "users");
const projects = table("public", "projects");
const members = table("public", "project_members");
const fks: ForeignKey[] = [
  { name: "projects_owner_id_fkey", schema: "public", table: "projects", columns: ["owner_id"], ref_schema: "public", ref_table: "users", ref_columns: ["id"], on_delete: "CASCADE", on_update: "NO ACTION" },
  { name: "members_project_fkey", schema: "public", table: "project_members", columns: ["project_id"], ref_schema: "public", ref_table: "projects", ref_columns: ["id"], on_delete: "CASCADE", on_update: "NO ACTION" },
  { name: "members_user_fkey", schema: "public", table: "project_members", columns: ["user_id"], ref_schema: "public", ref_table: "users", ref_columns: ["id"], on_delete: "CASCADE", on_update: "NO ACTION" },
  { name: "elsewhere", schema: "public", table: "projects", columns: ["org_id"], ref_schema: "public", ref_table: "organisations", ref_columns: ["id"], on_delete: "RESTRICT", on_update: "NO ACTION" },
];
const details = new Map<string, TableDetail | { error: string }>([
  [nodeId("public", "users"), detail(users, [column("id", "bigint", { is_primary_key: true, is_unique: true }), column("email", "citext", { is_unique: true })])],
  [nodeId("public", "projects"), detail(projects, [column("id", "bigint", { is_primary_key: true }), column("owner_id", "bigint", { fk_targets: ["public.users"] }), column("name", "character varying(100)", { is_nullable: true })])],
  [nodeId("public", "project_members"), detail(members, [column("project_id", "bigint", { is_primary_key: true, fk_targets: ["public.projects"] }), column("user_id", "bigint", { is_primary_key: true, fk_targets: ["public.users"] })])],
]);

/* ---------- Ids and the graph ---------- */

describe("schema graph", () => {
  it("builds stable ids for nodes, handles and edges", () => {
    expect(nodeId("public", "users")).toBe("public.users");
    expect(handleId("owner_id", "out")).toBe("owner_id:out");
    expect(handleId("id", "in")).toBe("id:in");
    expect(edgeId(fks[0])).toBe("fk:public.projects.projects_owner_id_fkey");
  });

  it("draws one edge per foreign key between the column handles and skips tables not drawn", () => {
    const g = buildGraph([users, projects, members], details, fks);
    expect(g.nodes.map((n) => n.id)).toEqual(["public.users", "public.projects", "public.project_members"]);
    expect(g.edges).toHaveLength(3);
    const e = g.edges.find((x) => x.id === edgeId(fks[0]));
    expect(e).toMatchObject({ source: "public.projects", target: "public.users", sourceHandle: "owner_id:out", targetHandle: "id:in" });
    expect(g.edges.some((x) => x.target === "public.organisations")).toBe(false);
  });

  it("marks referenced columns, sizes nodes from their rows and qualifies names across schemas", () => {
    const g = buildGraph([users, projects, members], details, fks);
    const u = g.nodes[0];
    expect(u.data.referenced.has("id")).toBe(true);
    expect(u.width).toBe(NODE_WIDTH);
    expect(u.height).toBe(nodeHeight(2));
    expect(u.data.qualify).toBe(false);
    const g2 = buildGraph([users, table("billing", "subscriptions")], details, []);
    expect(g2.nodes.every((n) => n.data.qualify)).toBe(true);
    expect(g2.nodes[1].data.columns).toEqual([]);
    expect(g2.nodes[1].height).toBe(nodeHeight(0));
  });

  it("keeps a failed detail as an error line", () => {
    const g = buildGraph([users], new Map([[nodeId("public", "users"), { error: "boom" }]]), []);
    expect(g.nodes[0].data.error).toBe("boom");
    expect(g.nodes[0].height).toBe(nodeHeight(1));
  });

  it("lays out deterministically, left to right, without overlaps", () => {
    const g = buildGraph([users, projects, members], details, fks);
    const a = layoutGraph(g.nodes, g.edges);
    const b = layoutGraph(g.nodes, g.edges);
    expect([...a.entries()]).toEqual([...b.entries()]);
    const x = (id: string) => a.get(id)?.x ?? NaN;
    // members → projects → users: referencing tables sit to the left of what they point at.
    expect(x("public.project_members")).toBeLessThan(x("public.projects"));
    expect(x("public.projects")).toBeLessThan(x("public.users"));
    const boxes = g.nodes.map((n) => ({ ...a.get(n.id)!, w: n.width, h: n.height }));
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i];
        const q = boxes[j];
        const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
        expect(overlap).toBe(false);
      }
    expect(a.get("public.users")).toEqual({ x: expect.any(Number), y: expect.any(Number) });
  });

  it("lights up the neighbourhood of a node or an edge", () => {
    const g = buildGraph([users, projects, members], details, fks);
    const n = neighbourhood(g, { node: "public.projects" });
    expect([...n.nodes].sort()).toEqual(["public.project_members", "public.projects", "public.users"]);
    expect(n.edges.size).toBe(2);
    const e = neighbourhood(g, { edge: edgeId(fks[2]) });
    expect([...e.nodes].sort()).toEqual(["public.project_members", "public.users"]);
    expect(neighbourhood(g, {}).nodes.size).toBe(0);
  });
});

/* ---------- Mermaid ---------- */

describe("mermaid export", () => {
  it("normalises types to single tokens", () => {
    expect(mermaidType("character varying(100)")).toBe("varchar(100)");
    expect(mermaidType("timestamp with time zone")).toBe("timestamptz");
    expect(mermaidType("double precision")).toBe("float8");
    expect(mermaidType("text[]")).toBe("text[]");
  });

  it("writes an erDiagram with entities, keys and one relation per foreign key", () => {
    const g = buildGraph([users, projects, members], details, fks);
    const text = toMermaid(g);
    expect(text).toBe(
      [
        "erDiagram",
        "  users {",
        "    bigint id PK",
        "    citext email UK",
        "  }",
        "  projects {",
        "    bigint id PK",
        "    bigint owner_id FK",
        '    varchar(100) name "nullable"',
        "  }",
        "  project_members {",
        "    bigint project_id PK, FK",
        "    bigint user_id PK, FK",
        "  }",
        '  users ||--o{ projects : "owner_id"',
        '  projects ||--o{ project_members : "project_id"',
        '  users ||--o{ project_members : "user_id"',
        "",
      ].join("\n"),
    );
  });

  it("qualifies entity names when several schemas are drawn", () => {
    const g = buildGraph([users, table("billing", "subscriptions")], details, []);
    expect(toMermaid(g)).toContain("  public_users {");
    expect(toMermaid(g)).toContain("  billing_subscriptions {");
  });
});

/* ---------- Plan requests ---------- */

describe("plan-request builders", () => {
  const fn: DbFunction = { id: 1, schema: "public", name: "add_one", language: "sql", kind: "function", args: "x integer", identity_args: "integer", return_type: "integer", returns_set: false, volatility: "IMMUTABLE", security_definer: false, definition: "CREATE OR REPLACE FUNCTION public.add_one(x integer) RETURNS integer LANGUAGE sql AS $$ SELECT x + 1 $$", comment: null, from_extension: false };

  it("drops a function by its catalog signature and carries the definition for the Down", () => {
    expect(signatureOf(fn)).toBe("add_one(integer)");
    expect(changes.dropFunction(fn)).toEqual({ kind: "drop_function", schema: "public", signature: "add_one(integer)", definition: fn.definition });
    expect(changes.dropFunction({ ...fn, definition: null }).definition).toBeUndefined();
  });

  it("reads the signature and the name from a CREATE FUNCTION statement", () => {
    expect(signatureFromDefinition("CREATE FUNCTION public.add_one(x integer DEFAULT 1, y text) RETURNS integer")).toBe("add_one(x integer, y text)");
    expect(signatureFromDefinition('create or replace function "tick"()\n returns trigger')).toBe("tick()");
    expect(signatureFromDefinition("SELECT 1")).toBeNull();
    expect(nameFromDefinition("CREATE TRIGGER stamp BEFORE UPDATE ON t", "trigger")).toBe("stamp");
    expect(nameFromDefinition("CREATE PROCEDURE billing.close_month()", "function")).toBe("close_month");
  });

  it("builds the object kinds with the fields ddl.go reads", () => {
    expect(changes.createExtension("pg_trgm")).toEqual({ kind: "create_extension", schema: "public", name: "pg_trgm" });
    expect(changes.dropExtension("pg_trgm")).toEqual({ kind: "drop_extension", schema: "public", name: "pg_trgm" });
    expect(changes.createFunction("public", "f", "f(integer)", "CREATE FUNCTION public.f(a integer) RETURNS integer LANGUAGE sql AS $$ SELECT a $$")).toMatchObject({ kind: "create_function", schema: "public", name: "f", signature: "f(integer)" });
    expect(changes.createTrigger("public", "projects", "stamp", "CREATE TRIGGER stamp …")).toEqual({ kind: "create_trigger", schema: "public", table: "projects", name: "stamp", definition: "CREATE TRIGGER stamp …" });
    expect(changes.dropTrigger("public", "projects", { id: 1, name: "stamp", definition: "CREATE TRIGGER stamp …", enabled: "origin", timing: "BEFORE", orientation: "ROW", events: ["UPDATE"], function_schema: "public", function_name: "tick" })).toEqual({ kind: "drop_trigger", schema: "public", table: "projects", name: "stamp", definition: "CREATE TRIGGER stamp …" });
    expect(changes.createEnum("public", "status", ["a", "b"])).toEqual({ kind: "create_enum", schema: "public", name: "status", values: ["a", "b"] });
    expect(changes.addEnumValue({ schema: "public", name: "status" }, "c", "a")).toEqual({ kind: "add_enum_value", schema: "public", name: "status", value: "c", after: "a" });
    expect(changes.addEnumValue({ schema: "public", name: "status" }, "c")).not.toHaveProperty("after");
    expect(changes.renameEnumValue({ schema: "public", name: "status" }, "a", "z")).toEqual({ kind: "rename_enum_value", schema: "public", name: "status", value: "a", new_name: "z" });
    expect(changes.dropEnum({ schema: "public", name: "status" })).toEqual({ kind: "drop_enum", schema: "public", name: "status" });
    expect(changes.dropIndex("public", "projects", "projects_name_idx")).toEqual({ kind: "drop_index", schema: "public", table: "projects", index_name: "projects_name_idx" });
    const view: DbView = { id: 1, schema: "public", name: "v", is_materialized: true, definition: " SELECT 1;", is_updatable: false, is_populated: true, comment: null };
    expect(changes.dropView(view)).toEqual({ kind: "drop_view", schema: "public", name: "v", definition: " SELECT 1;", materialized: true });
    expect(changes.createView("public", "v", "SELECT 1", false)).toEqual({ kind: "create_view", schema: "public", name: "v", definition: "SELECT 1", materialized: false });
  });

  it("compacts the index spec to what was set", () => {
    expect(changes.createIndex("public", "projects", { columns: [" name ", "", "(lower(email))"], name: " ", method: "", where: "", unique: false, concurrently: false })).toEqual({ kind: "create_index", schema: "public", table: "projects", index: { columns: ["name", "(lower(email))"] } });
    expect(changes.createIndex("public", "projects", { columns: ["a"], name: "a_idx", method: "GIN", where: "x > 1", unique: true, concurrently: true }).index).toEqual({ columns: ["a"], name: "a_idx", unique: true, method: "gin", where: "x > 1", concurrently: true });
  });
});

/* ---------- Migrations ---------- */

describe("migration list", () => {
  const m = (version: number, applied: boolean, extra: Partial<Migration> = {}): Migration => ({ version, name: `m${version}`, path: `db/migrations/${version}_m.sql`, sql: "-- +goose Up\nSELECT 1;\n-- +goose Down\nSELECT 0;\n", applied, applied_at: applied ? "2026-09-16T10:00:00Z" : null, has_down: true, ...extra });
  const list = [m(1, true), m(3, false), m(2, true, { has_down: false }), m(4, false), m(5, true, { path: "", name: "", sql: "" })];

  it("orders newest first and summarises current, pending and the last applied", () => {
    expect(newestFirst(list).map((x) => x.version)).toEqual([5, 4, 3, 2, 1]);
    const s = summarise(list);
    expect(s.current).toBe(5);
    expect(s.latest).toBe(5);
    expect(s.applied).toBe(3);
    expect(s.pending).toBe(2);
    expect(s.pendingList.map((x) => x.version)).toEqual([3, 4]);
    expect(s.last?.version).toBe(5);
    expect(s.orphans.map((x) => x.version)).toEqual([5]);
    expect(summarise([])).toMatchObject({ current: 0, latest: 0, applied: 0, pending: 0, last: undefined });
  });

  it("badges applied, pending, no Down and versions without a file", () => {
    expect(badgesFor(m(1, true))).toEqual(["applied"]);
    expect(badgesFor(m(2, false))).toEqual(["pending"]);
    expect(badgesFor(m(3, true, { has_down: false }))).toEqual(["applied", "no-down"]);
    expect(badgesFor(m(4, true, { path: "", has_down: false }))).toEqual(["applied", "orphan"]);
  });

  it("formats timestamp versions and splits goose sections", () => {
    expect(formatVersion(20260916000001)).toBe("2026-09-16 · 000001");
    expect(formatVersion(42)).toBe("42");
    expect(splitSections("-- note\n-- +goose NO TRANSACTION\n-- +goose Up\nCREATE X;\n\n-- +goose Down\nDROP X;\n")).toEqual({ up: "CREATE X;", down: "DROP X;", noTransaction: true });
    expect(splitSections("-- +goose Up\nCREATE X;\n")).toEqual({ up: "CREATE X;", down: null, noTransaction: false });
    expect(splitSections("SELECT 1")).toEqual({ up: "SELECT 1", down: null, noTransaction: false });
  });

  it("fingerprints the applied state and builds the schema query", () => {
    expect(migrationsFingerprint(list)).toBe("1:1,3:0,2:1,4:0,5:1");
    expect(schemaQuery(["public", "billing"])).toBe("?schema=public&schema=billing");
    expect(schemaQuery([])).toBe("");
  });
});
