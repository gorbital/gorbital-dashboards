import { beforeEach, describe, expect, it } from "vitest";
import type { DDLResponse, RowPage, Table, TableDetail } from "../db";
import type { Problem } from "../types";
import { mockDbFetch, resetMockDb } from "./db";

const get = (path: string) => mockDbFetch(new URL(path, "http://127.0.0.1:3100"), "GET", {});
const post = (path: string, body: unknown) => mockDbFetch(new URL(path, "http://127.0.0.1:3100"), "POST", { body: JSON.stringify(body) });

beforeEach(() => resetMockDb());

describe("mock database", () => {
  it("lists non-system tables by default, with ownership", async () => {
    const { tables } = (await get("/_portal/api/db/tables").json()) as { tables: Table[] };
    expect(tables.map((t) => `${t.schema}.${t.name}:${t.ownership}`)).toContain("public.projects:user");
    expect(tables.map((t) => `${t.schema}.${t.name}:${t.ownership}`)).toContain("public.auth_users:managed");
    expect(tables.map((t) => `${t.schema}.${t.name}:${t.ownership}`)).toContain("public.river_job:system");
    expect(tables.some((t) => t.schema === "pg_catalog")).toBe(false);
    const sys = (await get("/_portal/api/db/tables?schema=pg_catalog").json()) as { tables: Table[] };
    expect(sys.tables[0].schema).toBe("pg_catalog");
  });

  it("answers a table's detail with its primary key", async () => {
    const d = (await get("/_portal/api/db/tables/public/projects").json()) as TableDetail;
    expect(d.primary_key).toEqual(["id"]);
    expect(d.columns.find((c) => c.name === "status")?.enum_values).toEqual(["draft", "active", "archived"]);
    expect((await get("/_portal/api/db/tables/public/nope")).status).toBe(404);
  });

  it("filters, sorts and pages rows as text literals", async () => {
    const page = (await post("/_portal/api/db/rows/query", { schema: "public", table: "tasks", filters: [{ column: "done", operator: "is", value: "false" }, { column: "priority", operator: "<=", value: "3" }], sorts: [{ column: "priority", descending: true }], limit: 5, offset: 0 }).json()) as RowPage;
    expect(page.rows.length).toBeLessThanOrEqual(5);
    expect(page.estimated).toBe(false);
    const done = page.columns.findIndex((c) => c.name === "done");
    const prio = page.columns.findIndex((c) => c.name === "priority");
    for (const r of page.rows) {
      expect(r[done]).toBe("f");
      expect(Number(r[prio])).toBeLessThanOrEqual(3);
    }
    const prios = page.rows.map((r) => Number(r[prio]));
    expect(prios).toEqual([...prios].sort((a, b) => b - a));
    const like = (await post("/_portal/api/db/rows/query", { schema: "public", table: "projects", filters: [{ column: "name", operator: "~~*", value: "%APP%" }] }).json()) as RowPage;
    expect(like.count).toBe(1);
    const bad = await post("/_portal/api/db/rows/query", { schema: "public", table: "projects", filters: [{ column: "nope", operator: "=", value: "1" }] });
    expect(bad.status).toBe(422);
  });

  it("inserts with defaults, updates, and deletes by key", async () => {
    const ins = (await post("/_portal/api/db/rows/insert", { schema: "public", table: "tasks", values: { project_id: "prj_waszxoerymsl4wohbwjwrhkuve", title: "New one" } }).json()) as { row: (string | null)[] };
    expect(ins.row[0]).toBe("41");
    expect(ins.row[3]).toBe("f");
    expect(ins.row[5]).toBeNull();
    const upd = (await post("/_portal/api/db/rows/update", { schema: "public", table: "tasks", keys: [{ id: "41" }], values: { done: "true", priority: "1" } }).json()) as { row: (string | null)[] };
    expect(upd.row[3]).toBe("t");
    expect(upd.row[4]).toBe("1");
    const invalid = await post("/_portal/api/db/rows/update", { schema: "public", table: "tasks", keys: [{ id: "41" }], values: { priority: "high" } });
    expect(invalid.status).toBe(422);
    expect(((await invalid.json()) as Problem).detail).toMatch(/invalid input syntax for type integer/);
    const del = (await post("/_portal/api/db/rows/delete", { schema: "public", table: "tasks", keys: [{ id: "41" }] }).json()) as { deleted: number };
    expect(del.deleted).toBe(1);
    expect((await post("/_portal/api/db/rows/delete", { schema: "public", table: "tasks", keys: [{ id: "41" }] })).status).toBe(409);
  });

  it("refuses edits on system tables and tables without a key", async () => {
    const sys = await post("/_portal/api/db/rows/insert", { schema: "public", table: "river_job", values: { kind: "x", args: "{}" } });
    expect(sys.status).toBe(403);
    const nokey = await post("/_portal/api/db/rows/update", { schema: "public", table: "notes", keys: [{ body: "x" }], values: { body: "y" } });
    expect(nokey.status).toBe(409);
    expect(((await nokey.json()) as Problem).code).toBe("no_primary_key");
  });

  it("imports all or nothing", async () => {
    const ok = (await post("/_portal/api/db/rows/import", { schema: "public", table: "tasks", rows: [{ project_id: "prj_waszxoerymsl4wohbwjwrhkuve", title: "a" }, { project_id: "prj_waszxoerymsl4wohbwjwrhkuve", title: "b" }] }).json()) as { inserted: number };
    expect(ok.inserted).toBe(2);
    const bad = await post("/_portal/api/db/rows/import", { schema: "public", table: "tasks", rows: [{ project_id: "prj_waszxoerymsl4wohbwjwrhkuve", title: "c" }, { project_id: "prj_waszxoerymsl4wohbwjwrhkuve", title: null }] });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as Problem).detail).toMatch(/^row 2: null value/);
    const page = (await post("/_portal/api/db/rows/query", { schema: "public", table: "tasks", filters: [{ column: "title", operator: "in", values: ["a", "b", "c"] }] }).json()) as RowPage;
    expect(page.count).toBe(2);
  });

  it("plans and applies DDL, refusing a dirty tree until allowed", async () => {
    const change = { kind: "add_column", schema: "public", table: "projects", column: { name: "phone", type: "text", nullable: true, comment: "E.164" } };
    const plan = (await post("/_portal/api/db/ddl/plan", { change }).json()) as DDLResponse;
    expect(plan.applied).toBe(false);
    expect(plan.plan.up).toEqual(["ALTER TABLE public.projects ADD COLUMN phone text;", "COMMENT ON COLUMN public.projects.phone IS 'E.164';"]);
    expect(plan.plan.down).toEqual(["ALTER TABLE public.projects DROP COLUMN phone;"]);
    expect(plan.file.path).toBe("db/migrations/00014_add_phone_to_projects.sql");
    expect(plan.file.content).toContain("-- +goose Up");
    const dirty = await post("/_portal/api/db/ddl/apply", { change });
    expect(dirty.status).toBe(500);
    expect(((await dirty.json()) as Problem).detail).toMatch(/uncommitted changes/);
    const applied = (await post("/_portal/api/db/ddl/apply", { change, allow_dirty: true }).json()) as DDLResponse;
    expect(applied.applied).toBe(true);
    const d = (await get("/_portal/api/db/tables/public/projects").json()) as TableDetail;
    expect(d.columns.map((c) => c.name)).toContain("phone");
    const managed = await post("/_portal/api/db/ddl/plan", { change: { ...change, table: "auth_users" } });
    expect(managed.status).toBe(403);
    const drop = (await post("/_portal/api/db/ddl/plan", { change: { kind: "drop_column", schema: "public", table: "projects", column: { name: "phone" } } }).json()) as DDLResponse;
    expect(drop.plan.irreversible).toBe(true);
    const create = (await post("/_portal/api/db/ddl/plan", { change: { kind: "create_table", schema: "public", table: "invoices", columns: [{ name: "id", type: "int8", identity: "by_default", primary_key: true }, { name: "project_id", type: "text", nullable: false, references: { columns: ["project_id"], ref_schema: "public", ref_table: "projects", ref_columns: ["id"], on_delete: "CASCADE" } }] } }).json()) as DDLResponse;
    expect(create.plan.up[0]).toBe("CREATE TABLE public.invoices (\n    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,\n    project_id text NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE\n);");
  });
});
