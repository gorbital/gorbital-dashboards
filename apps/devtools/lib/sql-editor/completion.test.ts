import { describe, expect, it } from "vitest";
import { mentionedTables, resolveQualifier, tableInsertText, tableReferences } from "@gorbital/dash/components/monaco-sql";

const tables = [
  { schema: "public", name: "projects" },
  { schema: "public", name: "users" },
  { schema: "audit", name: "events" },
  { schema: "billing", name: "users" },
];
const catalog = { tables, columns: {} };

describe("tableReferences", () => {
  it("finds FROM, JOIN, UPDATE and INTO with schemas and aliases", () => {
    expect(tableReferences("SELECT * FROM projects p JOIN public.users AS u ON u.id = p.owner_id")).toEqual([
      { schema: undefined, table: "projects", alias: "p" },
      { schema: "public", table: "users", alias: "u" },
    ]);
    expect(tableReferences("UPDATE audit.events SET a = 1; INSERT INTO users (id) VALUES (1)")).toEqual([
      { schema: "audit", table: "events", alias: undefined },
      { schema: undefined, table: "users", alias: undefined },
    ]);
  });

  it("doesn't take a keyword for an alias, and skips strings and comments", () => {
    expect(tableReferences("SELECT * FROM projects WHERE x = 1")).toEqual([{ schema: undefined, table: "projects", alias: undefined }]);
    expect(tableReferences("SELECT * FROM users u\nLEFT JOIN projects ON true")).toEqual([
      { schema: undefined, table: "users", alias: "u" },
      { schema: undefined, table: "projects", alias: undefined },
    ]);
    expect(tableReferences("-- FROM ghosts\nSELECT 'FROM nowhere' FROM users")).toEqual([{ schema: undefined, table: "users", alias: undefined }]);
  });
});

describe("mentionedTables", () => {
  it("resolves bare names to public first, qualified names exactly, once each", () => {
    expect(mentionedTables("SELECT * FROM users u JOIN billing.users b ON b.id = u.id JOIN users x ON true", tables)).toEqual([
      { schema: "public", name: "users" },
      { schema: "billing", name: "users" },
    ]);
    expect(mentionedTables("SELECT * FROM events", tables)).toEqual([{ schema: "audit", name: "events" }]);
    expect(mentionedTables("SELECT * FROM nothing", tables)).toEqual([]);
  });
});

describe("resolveQualifier", () => {
  const sql = "SELECT p.id FROM projects p JOIN billing.users bu ON bu.id = p.owner_id";
  it("maps an alias to its table", () => {
    expect(resolveQualifier(sql, "p", catalog)).toEqual({ kind: "table", table: { schema: "public", name: "projects" } });
    expect(resolveQualifier(sql, "bu", catalog)).toEqual({ kind: "table", table: { schema: "billing", name: "users" } });
  });
  it("falls back to a table name, then a schema", () => {
    expect(resolveQualifier(sql, "users", catalog)).toEqual({ kind: "table", table: { schema: "public", name: "users" } });
    expect(resolveQualifier(sql, "audit", catalog)).toEqual({ kind: "schema", schema: "audit" });
    expect(resolveQualifier(sql, "zzz", catalog)).toBeUndefined();
  });
});

describe("tableInsertText", () => {
  it("qualifies anything outside public", () => {
    expect(tableInsertText({ schema: "public", name: "users" })).toBe("users");
    expect(tableInsertText({ schema: "audit", name: "events" })).toBe("audit.events");
  });
});
