/**
 * Cells are PostgreSQL text literals, in and out. These helpers turn one
 * into what a typed editor holds (a boolean, a list, a datetime-local
 * string, pretty JSON) and back; anything they don't understand stays text.
 */
import type { Cell, Column } from "../api/db";

export type CellKind = "bool" | "json" | "enum" | "number" | "timestamptz" | "timestamp" | "date" | "time" | "uuid" | "bytea" | "text";

const numeric = new Set(["int2", "int4", "int8", "float4", "float8", "numeric", "money", "oid"]);

/** The element type's name: arrays are typed `_int4`, `_status`. */
export function baseTypeName(col: Pick<Column, "type_name" | "is_array">): string {
  return col.is_array && col.type_name.startsWith("_") ? col.type_name.slice(1) : col.type_name;
}

export function cellKind(col: Pick<Column, "type_name" | "is_array" | "enum_values">): CellKind {
  if (col.enum_values && col.enum_values.length) return "enum";
  const t = baseTypeName(col);
  if (t === "bool") return "bool";
  if (t === "json" || t === "jsonb") return "json";
  if (numeric.has(t)) return "number";
  if (t === "timestamptz") return "timestamptz";
  if (t === "timestamp") return "timestamp";
  if (t === "date") return "date";
  if (t === "time" || t === "timetz") return "time";
  if (t === "uuid") return "uuid";
  if (t === "bytea") return "bytea";
  return "text";
}

/* ---------- Booleans ---------- */

export function parseBool(lit: string): boolean | undefined {
  const v = lit.trim().toLowerCase();
  if (v === "t" || v === "true" || v === "yes" || v === "on" || v === "1") return true;
  if (v === "f" || v === "false" || v === "no" || v === "off" || v === "0") return false;
  return undefined;
}

export const formatBool = (b: boolean): string => (b ? "true" : "false");

/* ---------- Arrays ---------- */

/**
 * Parses a one-dimensional array literal: `{a,b}`, `{"a b","say \"hi\"",NULL}`,
 * `{}`. Nested arrays and dimension prefixes aren't understood (undefined).
 */
export function parsePgArray(lit: string): (string | null)[] | undefined {
  const s = lit.trim();
  if (!s.startsWith("{") || !s.endsWith("}")) return undefined;
  const body = s.slice(1, -1);
  if (body === "") return [];
  const out: (string | null)[] = [];
  let i = 0;
  while (i <= body.length) {
    if (body[i] === "{") return undefined;
    if (body[i] === '"') {
      let v = "";
      i++;
      while (i < body.length && body[i] !== '"') {
        if (body[i] === "\\") i++;
        v += body[i] ?? "";
        i++;
      }
      i++; // closing quote
      out.push(v);
    } else {
      let v = "";
      while (i < body.length && body[i] !== ",") v += body[i++];
      out.push(v === "NULL" ? null : v);
    }
    if (i >= body.length) break;
    if (body[i] !== ",") return undefined;
    i++;
  }
  return out;
}

const needsQuote = /[{}",\\\s]/;

export function formatPgArray(items: (string | null)[]): string {
  return (
    "{" +
    items
      .map((v) => {
        if (v === null) return "NULL";
        if (v === "" || v.toUpperCase() === "NULL" || needsQuote.test(v)) return '"' + v.replaceAll("\\", "\\\\").replaceAll('"', '\\"') + '"';
        return v;
      })
      .join(",") +
    "}"
  );
}

/* ---------- JSON ---------- */

export function parseJSON(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err instanceof SyntaxError ? err.message : "invalid JSON" };
  }
}

export function prettyJSON(lit: string): string {
  const r = parseJSON(lit);
  return r.ok ? JSON.stringify(r.value, null, 2) : lit;
}

export function compactJSON(text: string): string {
  const r = parseJSON(text);
  return r.ok ? JSON.stringify(r.value) : text;
}

/* ---------- Dates and times ---------- */

const offsetPat = /([+-])(\d\d)(?::?(\d\d))?$/;

/**
 * `2026-09-16 18:00:56.718279+00` → `2026-09-16T18:00:56.718` in UTC, for a
 * datetime-local input (microseconds are cut; PostgreSQL keeps them until
 * the value is saved again). Without an offset the wall-clock time is kept.
 */
export function timestampToInput(lit: string): string {
  const s = lit.trim();
  const m = offsetPat.exec(s);
  const local = s.replace(offsetPat, "").replace(" ", "T");
  if (!m) return trimFraction(local);
  const iso = `${local}${m[1]}${m[2]}:${m[3] ?? "00"}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return trimFraction(local);
  const out = d.toISOString().slice(0, -1); // YYYY-MM-DDTHH:MM:SS.mmm
  return trimFraction(out);
}

function trimFraction(s: string): string {
  // Keep milliseconds at most, and none when they are zero.
  const m = /^(.*?T\d\d:\d\d:\d\d)(?:\.(\d+))?$/.exec(s);
  if (!m) return s;
  const ms = (m[2] ?? "").slice(0, 3).replace(/0+$/, "");
  return ms ? `${m[1]}.${ms}` : m[1];
}

/** The datetime-local value back to a literal; timestamptz values are UTC. */
export function inputToTimestamp(input: string, withTz: boolean): string {
  const s = input.trim().replace("T", " ");
  if (!s) return s;
  const withSeconds = /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(s) ? `${s}:00` : s;
  return withTz ? `${withSeconds}+00` : withSeconds;
}

/** `10:00:00+00` → `10:00:00`; a time input keeps seconds. */
export function timeToInput(lit: string): string {
  return lit.trim().replace(offsetPat, "");
}

/* ---------- Editor values ---------- */

/** What an editor holds: NULL, a boolean, an array's items, or text in the input's own format. */
export type EditorValue = null | boolean | (string | null)[] | string;

export function toEditor(col: Pick<Column, "type_name" | "is_array" | "enum_values">, lit: Cell): EditorValue {
  if (lit === null) return null;
  if (col.is_array) return parsePgArray(lit) ?? lit;
  switch (cellKind(col)) {
    case "bool":
      return parseBool(lit) ?? lit;
    case "json":
      return prettyJSON(lit);
    case "timestamptz":
    case "timestamp":
      return timestampToInput(lit);
    case "time":
      return timeToInput(lit);
    default:
      return lit;
  }
}

export function fromEditor(col: Pick<Column, "type_name" | "is_array" | "enum_values">, v: EditorValue): Cell {
  if (v === null) return null;
  if (typeof v === "boolean") return formatBool(v);
  if (Array.isArray(v)) return formatPgArray(v);
  if (col.is_array) return v;
  switch (cellKind(col)) {
    case "json":
      return compactJSON(v);
    case "timestamptz":
      return inputToTimestamp(v, true);
    case "timestamp":
      return inputToTimestamp(v, false);
    default:
      return v;
  }
}

/** Something to show in a grid cell: one line, shortened. */
export function displayCell(lit: Cell, max = 200): string {
  if (lit === null) return "";
  const one = lit.replaceAll(/\s*\n\s*/g, " ");
  return one.length > max ? one.slice(0, max - 1) + "…" : one;
}

/** The column's default, as a placeholder: `'active'::text` → `'active'`, `nextval(...)` stays. */
export function defaultPlaceholder(col: Pick<Column, "default_expr" | "identity" | "generation_expr">): string {
  if (col.identity) return col.identity === "a" ? "generated always" : "generated by default";
  if (col.generation_expr) return `generated: ${col.generation_expr}`;
  if (col.default_expr === null) return "";
  return col.default_expr.replace(/::[a-z_ "]+(\[\])?$/i, "");
}
