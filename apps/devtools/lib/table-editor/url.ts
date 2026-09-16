/**
 * The Table Editor's state in the URL, so a filtered, sorted page can be
 * linked to and reloaded:
 *
 *   /database/tables?schema=public&table=projects
 *     &filter=status:=:active&filter=name:~~*:%25web%25&filter=owner_id:is:null
 *     &sort=created_at:desc&sort=name:asc:nulls_first
 *     &limit=100&page=2&view=definition
 *
 * A filter is `column:operator:value`; the value may itself contain colons
 * (split at the first two only). An `in` filter's values are comma
 * separated (a comma inside a value is written `\,`).
 */
import type { Filter, FilterOperator, Sort } from "../api/db";

export const operators: FilterOperator[] = ["=", "<>", ">", "<", ">=", "<=", "~~", "~~*", "in", "is"];

export const operatorLabels: Record<FilterOperator, string> = {
  "=": "equals",
  "<>": "not equal",
  ">": "greater than",
  "<": "less than",
  ">=": "at least",
  "<=": "at most",
  "~~": "like",
  "~~*": "ilike",
  in: "in list",
  is: "is",
};

export const isValues = ["null", "not null", "true", "false"] as const;

export type ViewMode = "data" | "definition";

export type EditorState = {
  schema?: string;
  table?: string;
  filters: Filter[];
  sorts: Sort[];
  limit: number;
  page: number;
  view: ViewMode;
};

export const pageSizes = [100, 500, 1000] as const;

function isOperator(s: string): s is FilterOperator {
  return (operators as string[]).includes(s);
}

/** Splits an `in` list on commas not escaped as `\,`. */
export function splitList(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && s[i + 1] === ",") {
      cur += ",";
      i++;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.filter((v, i, a) => v !== "" || a.length === 1);
}

export function joinList(values: string[]): string {
  return values.map((v) => v.replaceAll(",", "\\,")).join(",");
}

export function parseFilter(s: string): Filter | undefined {
  const i = s.indexOf(":");
  if (i <= 0) return undefined;
  const column = s.slice(0, i);
  const rest = s.slice(i + 1);
  const j = rest.indexOf(":");
  const operator = j < 0 ? rest : rest.slice(0, j);
  const value = j < 0 ? "" : rest.slice(j + 1);
  if (!isOperator(operator)) return undefined;
  if (operator === "in") return { column, operator, values: splitList(value) };
  return { column, operator, value };
}

export function serializeFilter(f: Filter): string {
  const value = f.operator === "in" ? joinList(f.values ?? []) : (f.value ?? "");
  return `${f.column}:${f.operator}:${value}`;
}

export function parseSort(s: string): Sort | undefined {
  const [column, dir, nulls] = s.split(":");
  if (!column) return undefined;
  const sort: Sort = { column };
  if (dir === "desc") sort.descending = true;
  if (nulls === "nulls_first") sort.nulls_first = true;
  return sort;
}

export function serializeSort(s: Sort): string {
  let out = `${s.column}:${s.descending ? "desc" : "asc"}`;
  if (s.nulls_first) out += ":nulls_first";
  return out;
}

export function parseState(params: URLSearchParams): EditorState {
  const limitRaw = Number(params.get("limit"));
  const limit = (pageSizes as readonly number[]).includes(limitRaw) ? limitRaw : pageSizes[0];
  const pageRaw = Number(params.get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const view = params.get("view") === "definition" ? "definition" : "data";
  return {
    schema: params.get("schema") ?? undefined,
    table: params.get("table") ?? undefined,
    filters: params.getAll("filter").map(parseFilter).filter((f): f is Filter => Boolean(f)),
    sorts: params.getAll("sort").map(parseSort).filter((s): s is Sort => Boolean(s)),
    limit,
    page,
    view,
  };
}

/** Writes the state back; defaults (page 1, limit 100, data view) stay out of the URL. */
export function serializeState(s: EditorState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.schema) p.set("schema", s.schema);
  if (s.table) p.set("table", s.table);
  for (const f of s.filters) p.append("filter", serializeFilter(f));
  for (const so of s.sorts) p.append("sort", serializeSort(so));
  if (s.limit !== pageSizes[0]) p.set("limit", String(s.limit));
  if (s.page > 1) p.set("page", String(s.page));
  if (s.view !== "data") p.set("view", s.view);
  return p;
}

/** The link that opens `table` filtered to one key, for foreign key cells. */
export function tableHref(schema: string, table: string, filter?: Filter): string {
  const p = serializeState({ schema, table, filters: filter ? [filter] : [], sorts: [], limit: pageSizes[0], page: 1, view: "data" });
  return `/database/tables?${p.toString()}`;
}
