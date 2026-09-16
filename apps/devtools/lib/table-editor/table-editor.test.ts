import { describe, expect, it } from "vitest";
import type { Column, TableDetail } from "../api/db";
import { chunk, guessMapping, mapRows, runImport, toCSV, toJSONExport } from "./csv";
import { createTableSQL } from "./definition";
import { cellKind, formatPgArray, fromEditor, inputToTimestamp, parsePgArray, timestampToInput, toEditor } from "./literals";
import { addColumnChange, columnFormFromColumn, columnSpecFromForm, createTableChanges, editColumnChanges, emptyColumnForm, pickerTypeOf } from "./plan";
import { parseFilter, parseState, serializeFilter, serializeState, tableHref } from "./url";

const col = (patch: Partial<Column>): Column => ({
  ordinal: 1,
  name: "c",
  data_type: "text",
  type_name: "text",
  type_schema: "pg_catalog",
  is_array: false,
  is_nullable: true,
  default_expr: null,
  generation_expr: null,
  identity: "",
  generated: "",
  comment: null,
  is_primary_key: false,
  is_unique: false,
  ...patch,
});

describe("url state", () => {
  it("round-trips filters, sorts, paging and the view", () => {
    const p = new URLSearchParams("schema=public&table=projects&filter=status:=:active&filter=name:~~*:%25a:b%25&filter=tags:in:x,y%5C,z&filter=owner:is:not%20null&sort=created_at:desc&sort=name:asc:nulls_first&limit=500&page=3&view=definition");
    const s = parseState(p);
    expect(s.schema).toBe("public");
    expect(s.table).toBe("projects");
    expect(s.filters).toEqual([
      { column: "status", operator: "=", value: "active" },
      { column: "name", operator: "~~*", value: "%a:b%" },
      { column: "tags", operator: "in", values: ["x", "y,z"] },
      { column: "owner", operator: "is", value: "not null" },
    ]);
    expect(s.sorts).toEqual([{ column: "created_at", descending: true }, { column: "name", nulls_first: true }]);
    expect(s.limit).toBe(500);
    expect(s.page).toBe(3);
    expect(s.view).toBe("definition");
    expect(serializeState(s).toString()).toBe(p.toString());
  });

  it("drops what it doesn't understand and keeps defaults out of the URL", () => {
    const s = parseState(new URLSearchParams("filter=bad&filter=x:nope:1&sort=&limit=7&page=0"));
    expect(s.filters).toEqual([]);
    expect(s.sorts).toEqual([]);
    expect(s.limit).toBe(100);
    expect(s.page).toBe(1);
    expect(serializeState(s).toString()).toBe("");
  });

  it("serialises a filter with an empty value", () => {
    expect(serializeFilter({ column: "a", operator: "=", value: "" })).toBe("a:=:");
    expect(parseFilter("a:=:")).toEqual({ column: "a", operator: "=", value: "" });
    expect(parseFilter("a:=")).toEqual({ column: "a", operator: "=", value: "" });
  });

  it("links to a referenced row", () => {
    expect(tableHref("public", "auth_users", { column: "id", operator: "=", value: "usr_1" })).toBe("/database/tables?schema=public&table=auth_users&filter=id%3A%3D%3Ausr_1");
  });
});

describe("literals", () => {
  it("classifies columns", () => {
    expect(cellKind(col({ type_name: "bool" }))).toBe("bool");
    expect(cellKind(col({ type_name: "_int4", is_array: true }))).toBe("number");
    expect(cellKind(col({ type_name: "jsonb" }))).toBe("json");
    expect(cellKind(col({ type_name: "status", enum_values: ["a", "b"] }))).toBe("enum");
    expect(cellKind(col({ type_name: "timestamptz" }))).toBe("timestamptz");
  });

  it("converts booleans and NULL", () => {
    const b = col({ type_name: "bool" });
    expect(toEditor(b, "t")).toBe(true);
    expect(toEditor(b, "f")).toBe(false);
    expect(toEditor(b, null)).toBeNull();
    expect(fromEditor(b, true)).toBe("true");
    expect(fromEditor(b, null)).toBeNull();
  });

  it("parses and formats array literals", () => {
    expect(parsePgArray("{}")).toEqual([]);
    expect(parsePgArray("{a,b}")).toEqual(["a", "b"]);
    expect(parsePgArray('{"a b","say \\"hi\\"",NULL,"NULL",""}')).toEqual(["a b", 'say "hi"', null, "NULL", ""]);
    expect(parsePgArray("{{1,2},{3,4}}")).toBeUndefined();
    expect(formatPgArray(["a", "b c", null, "NULL", "", 'q"'])).toBe('{a,"b c",NULL,"NULL","","q\\""}');
    const arr = col({ type_name: "_text", is_array: true });
    expect(fromEditor(arr, toEditor(arr, "{x,\"y z\"}"))).toBe('{x,"y z"}');
  });

  it("pretty-prints JSON for editing and compacts it for saving", () => {
    const j = col({ type_name: "jsonb" });
    expect(toEditor(j, '{"a": 1, "b": [1,2]}')).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
    expect(fromEditor(j, '{ "a" : 1 }')).toBe('{"a":1}');
    expect(fromEditor(j, "not json")).toBe("not json");
  });

  it("converts timestamps to UTC datetime-local values and back", () => {
    expect(timestampToInput("2026-09-16 18:00:56.718279+00")).toBe("2026-09-16T18:00:56.718");
    expect(timestampToInput("2026-09-16 21:00:00+03")).toBe("2026-09-16T18:00:00");
    expect(timestampToInput("2026-09-16 18:00:00")).toBe("2026-09-16T18:00:00");
    expect(inputToTimestamp("2026-09-16T18:00", true)).toBe("2026-09-16 18:00:00+00");
    expect(inputToTimestamp("2026-09-16T18:00:56.718", false)).toBe("2026-09-16 18:00:56.718");
    const ts = col({ type_name: "timestamptz" });
    expect(fromEditor(ts, toEditor(ts, "2026-09-16 18:00:00+00"))).toBe("2026-09-16 18:00:00+00");
  });
});

describe("csv", () => {
  const columns = [col({ name: "id" }), col({ name: "full_name" }), col({ name: "email" })];

  it("guesses the mapping from headers", () => {
    expect(guessMapping(["ID", "Full Name", "e-mail", "Full Name", "other"], columns)).toEqual(["id", "full_name", null, null, null]);
  });

  it("maps rows, skipping blank lines and turning empties into NULL when asked", () => {
    const rows = [
      ["1", "Ann", ""],
      ["", "", ""],
      ["2", "NULL", "b@x"],
    ];
    expect(mapRows(rows, ["id", "full_name", "email"], { emptyAsNull: true })).toEqual([
      { id: "1", full_name: "Ann", email: null },
      { id: "2", full_name: "NULL", email: "b@x" },
    ]);
    expect(mapRows(rows, ["id", null, "email"], { emptyAsNull: false, nullWord: true })).toEqual([
      { id: "1", email: "" },
      { id: "2", email: "b@x" },
    ]);
  });

  it("batches and stops at the first failure", async () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    const rows = Array.from({ length: 7 }, (_, i) => ({ id: String(i) }));
    const sent: number[] = [];
    const out = await runImport(
      rows,
      async (b) => {
        sent.push(b.length);
        if (sent.length === 3) throw new Error("row 1: bad");
        return { inserted: b.length };
      },
      undefined,
      2,
    );
    expect(sent).toEqual([2, 2, 2]);
    expect(out.inserted).toBe(4);
    expect(out.failed?.batch).toBe(3);
    expect((out.failed?.error as Error).message).toBe("row 1: bad");
  });

  it("exports CSV and JSON with NULLs kept apart from empty strings", () => {
    expect(toCSV(["a", "b"], [["x", null], ['say "hi"', ""]])).toBe('a,b\r\nx,\r\n"say ""hi""",""\r\n');
    expect(JSON.parse(toJSONExport(["a", "b"], [["x", null]]))).toEqual([{ a: "x", b: null }]);
  });
});

describe("plan builders", () => {
  it("builds a ColumnSpec from a form, leaving unset fields out", () => {
    const f = emptyColumnForm({ name: "amount", type: "numeric(10,2)", nullable: false, default: "0", unique: true, check: "amount >= 0", comment: "in cents" });
    expect(columnSpecFromForm(f)).toEqual({ name: "amount", type: "numeric(10,2)", nullable: false, default: "0", unique: true, check: "amount >= 0", comment: "in cents" });
    const pk = emptyColumnForm({ name: "id", type: "int8", identity: "by_default", primaryKey: true, nullable: false });
    expect(columnSpecFromForm(pk)).toEqual({ name: "id", type: "int8", identity: "by_default", primary_key: true });
    const arr = emptyColumnForm({ name: "tags", type: "text", array: true, default: "'{}'", defaultIsExpr: true });
    expect(columnSpecFromForm(arr)).toEqual({ name: "tags", type: "text", array: true, nullable: true, default: "'{}'", default_is_expr: true });
    expect(addColumnChange("public", "projects", arr)).toMatchObject({ kind: "add_column", schema: "public", table: "projects", column: { name: "tags" } });
  });

  it("builds create_table with uniques, foreign keys and a comment change", () => {
    const changes = createTableChanges({
      schema: "public",
      name: "tasks",
      comment: "Things to do",
      columns: [emptyColumnForm({ name: "id", type: "int8", primaryKey: true, identity: "always" }), emptyColumnForm({ name: "project_id", type: "text", nullable: false, references: { ref_schema: "public", ref_table: "projects", ref_columns: ["id"], on_delete: "CASCADE", on_update: "NO ACTION" } })],
      uniques: [["project_id", "id"], []],
      foreignKeys: [{ columns: ["project_id"], ref_schema: "public", ref_table: "projects", ref_columns: ["id"], on_delete: "SET NULL", on_update: "NO ACTION" }],
    });
    expect(changes).toHaveLength(2);
    expect(changes[0]).toEqual({
      kind: "create_table",
      schema: "public",
      table: "tasks",
      columns: [
        { name: "id", type: "int8", identity: "always", primary_key: true },
        { name: "project_id", type: "text", nullable: false, references: { columns: ["project_id"], ref_schema: "public", ref_table: "projects", ref_columns: ["id"], on_delete: "CASCADE" } },
      ],
      uniques: [["project_id", "id"]],
      foreign_keys: [{ columns: ["project_id"], ref_schema: "public", ref_table: "projects", ref_columns: ["id"], on_delete: "SET NULL" }],
    });
    expect(changes[1]).toEqual({ kind: "comment", schema: "public", table: "tasks", comment: "Things to do" });
  });

  it("reads a column back into a form", () => {
    expect(pickerTypeOf(col({ type_name: "varchar", data_type: "character varying(100)" }))).toBe("varchar(100)");
    expect(pickerTypeOf(col({ type_name: "numeric", data_type: "numeric(10,2)" }))).toBe("numeric(10,2)");
    expect(pickerTypeOf(col({ type_name: "_int4", data_type: "integer[]", is_array: true }))).toBe("int4");
    expect(pickerTypeOf(col({ type_name: "status", type_schema: "public", data_type: "status", enum_values: ["a"] }))).toBe("public.status");
    const f = columnFormFromColumn(col({ name: "n", type_name: "int8", data_type: "bigint", is_nullable: false, default_expr: "1", identity: "d" }));
    expect(f).toMatchObject({ name: "n", type: "int8", nullable: false, default: "1", defaultIsExpr: true, identity: "by_default" });
  });

  it("turns an edit into rename + alter with only the changed fields", () => {
    const current = col({ name: "status", type_name: "text", data_type: "text", is_nullable: false, default_expr: "'active'::text" });
    const initial = columnFormFromColumn(current);
    expect(editColumnChanges("public", "projects", current, { ...initial })).toEqual([]);
    const changes = editColumnChanges("public", "projects", current, { ...initial, name: "state", nullable: true, default: "", comment: "lifecycle" }, initial);
    expect(changes).toEqual([
      { kind: "alter_column", schema: "public", table: "projects", column: { name: "status", type: "", nullable: true, default: "", default_is_expr: true, comment: "lifecycle" } },
      { kind: "rename_column", schema: "public", table: "projects", column: { name: "status", type: "" }, new_name: "state" },
    ]);
    const typed = editColumnChanges("public", "projects", current, { ...initial, type: "varchar(20)", identity: "none", check: "state <> ''" }, initial);
    expect(typed).toEqual([
      { kind: "alter_column", schema: "public", table: "projects", column: { name: "status", type: "varchar(20)" } },
      { kind: "add_check", schema: "public", table: "projects", check: "state <> ''" },
    ]);
  });
});

describe("definition", () => {
  it("reconstructs CREATE TABLE from the detail", () => {
    const d: TableDetail = {
      table: { id: 1, schema: "public", name: "projects", kind: "table", is_partition: false, rls_enabled: true, rls_forced: false, row_estimate: 0, live_rows: 3, bytes: 0, size: "0 bytes", comment: "The apps", owner: "x", from_extension: false, ownership: "user" },
      columns: [
        col({ name: "id", type_name: "int8", data_type: "bigint", is_nullable: false, identity: "a", is_primary_key: true }),
        col({ name: "name", is_nullable: false, comment: "shown" }),
        col({ name: "status", default_expr: "'active'::text" }),
        col({ name: "Odd Name", type_name: "int4", data_type: "integer", generation_expr: "id * 2", generated: "s" }),
      ],
      constraints: [
        { id: 1, name: "projects_name_check", type: "c", definition: "CHECK (char_length(name) > 0)", deferrable: false, deferred: false, validated: true, columns: ["name"], ref_schema: null, ref_table: null, on_delete: null, on_update: null },
        { id: 2, name: "projects_pkey", type: "p", definition: "PRIMARY KEY (id)", deferrable: false, deferred: false, validated: true, columns: ["id"], ref_schema: null, ref_table: null, on_delete: null, on_update: null },
      ],
      indexes: [
        { id: 1, name: "projects_pkey", definition: "CREATE UNIQUE INDEX projects_pkey ON public.projects USING btree (id)", method: "btree", is_unique: true, is_primary: true, is_valid: true, is_partial: false, columns: ["id"], bytes: 0, scans: 0, last_scan: null },
        { id: 2, name: "projects_status_idx", definition: "CREATE INDEX projects_status_idx ON public.projects USING btree (status)", method: "btree", is_unique: false, is_primary: false, is_valid: true, is_partial: false, columns: ["status"], bytes: 0, scans: 0, last_scan: null },
      ],
      triggers: [{ id: 1, name: "t", definition: "CREATE TRIGGER t BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION touch()", enabled: "origin", timing: "BEFORE", orientation: "ROW", events: ["UPDATE"], function_schema: "public", function_name: "touch" }],
      primary_key: ["id"],
    };
    expect(createTableSQL(d)).toBe(
      [
        "CREATE TABLE public.projects (",
        "    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,",
        "    name text NOT NULL,",
        "    status text DEFAULT 'active'::text,",
        '    "Odd Name" integer GENERATED ALWAYS AS (id * 2) STORED,',
        "    CONSTRAINT projects_pkey PRIMARY KEY (id),",
        "    CONSTRAINT projects_name_check CHECK (char_length(name) > 0)",
        ");",
        "",
        "CREATE INDEX projects_status_idx ON public.projects USING btree (status);",
        "",
        "COMMENT ON TABLE public.projects IS 'The apps';",
        "",
        "COMMENT ON COLUMN public.projects.name IS 'shown';",
        "",
        "ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;",
        "",
        "CREATE TRIGGER t BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION touch();",
        "",
      ].join("\n"),
    );
  });
});
