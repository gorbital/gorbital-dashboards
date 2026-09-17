/**
 * The schema diagram's pure parts: node and edge ids, the graph built from
 * the catalog, dagre's layout, and the Mermaid export. No React, no DOM,
 * so all of it is unit tested.
 */
import dagre from "@dagrejs/dagre";
import type { DbColumn, DbTable, ForeignKey, TableDetail } from "@/lib/api/schema";

/* ---------- Ids ---------- */

export const nodeId = (schema: string, table: string) => `${schema}.${table}`;

/** A column's handles: the left side receives foreign keys, the right side sends them. */
export const handleId = (column: string, side: "in" | "out") => `${column}:${side}`;

export const edgeId = (fk: Pick<ForeignKey, "schema" | "table" | "name">) => `fk:${fk.schema}.${fk.table}.${fk.name}`;

/* ---------- Shapes ---------- */

export type TableNodeData = {
  table: DbTable;
  columns: DbColumn[];
  /** The columns that belong to the primary key, in order. */
  primaryKey: string[];
  /** Columns referenced by a foreign key of another table. */
  referenced: Set<string>;
  /** The detail request failed; the node shows the message instead of columns. */
  error?: string;
  /** More than one schema is drawn, so the header shows `schema.table`. */
  qualify: boolean;
};

export type GraphNode = { id: string; data: TableNodeData; width: number; height: number };
export type GraphEdge = { id: string; source: string; target: string; sourceHandle: string; targetHandle: string; fk: ForeignKey };
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

/** Pixel sizes the node component renders with; dagre needs them before the DOM exists. */
export const NODE_WIDTH = 248;
export const HEADER_HEIGHT = 34;
export const ROW_HEIGHT = 22;
export const NODE_PADDING = 6;

export function nodeHeight(rows: number): number {
  return HEADER_HEIGHT + Math.max(rows, 1) * ROW_HEIGHT + NODE_PADDING;
}

/**
 * Builds the diagram from the tables to draw, their details (matched by
 * schema.table; missing while loading) and the foreign keys. An edge goes
 * from the referencing column's right handle to the referenced column's
 * left handle; foreign keys to tables that aren't drawn are skipped.
 * Composite keys draw one edge per column pair.
 */
export function buildGraph(tables: DbTable[], details: Map<string, TableDetail | { error: string }>, fks: ForeignKey[]): Graph {
  const schemas = new Set(tables.map((t) => t.schema));
  const ids = new Set(tables.map((t) => nodeId(t.schema, t.name)));
  const referenced = new Map<string, Set<string>>();
  for (const fk of fks) {
    const ref = nodeId(fk.ref_schema, fk.ref_table);
    if (!referenced.has(ref)) referenced.set(ref, new Set());
    for (const c of fk.ref_columns) referenced.get(ref)?.add(c);
  }
  const nodes: GraphNode[] = tables.map((t) => {
    const id = nodeId(t.schema, t.name);
    const d = details.get(id);
    const columns = d && "columns" in d ? d.columns : [];
    const data: TableNodeData = {
      table: t,
      columns,
      primaryKey: d && "primary_key" in d ? d.primary_key : [],
      referenced: referenced.get(id) ?? new Set(),
      error: d && "error" in d ? d.error : undefined,
      qualify: schemas.size > 1,
    };
    return { id, data, width: NODE_WIDTH, height: nodeHeight(data.error ? 1 : columns.length) };
  });
  const edges: GraphEdge[] = [];
  for (const fk of fks) {
    const source = nodeId(fk.schema, fk.table);
    const target = nodeId(fk.ref_schema, fk.ref_table);
    if (!ids.has(source) || !ids.has(target)) continue;
    fk.columns.forEach((c, i) => {
      const refCol = fk.ref_columns[i] ?? fk.ref_columns[0] ?? "";
      edges.push({ id: fk.columns.length > 1 ? `${edgeId(fk)}#${i}` : edgeId(fk), source, target, sourceHandle: handleId(c, "out"), targetHandle: handleId(refCol, "in"), fk });
    });
  }
  return { nodes, edges };
}

/* ---------- Layout ---------- */

export type Position = { x: number; y: number };

const GAP_X = 36;
const GAP_Y = 28;

/**
 * Lays the graph out: the tables joined by foreign keys left to right with
 * dagre (referencing tables on the left, what they point at on the right),
 * and the tables without any foreign key in a grid to the right of them,
 * no taller than the connected part. Deterministic for the same input;
 * returns the top-left corner of every node.
 */
export function layoutGraph(nodes: Pick<GraphNode, "id" | "width" | "height">[], edges: Pick<GraphEdge, "source" | "target">[]): Map<string, Position> {
  const linked = new Set<string>();
  for (const e of edges) if (e.source !== e.target) {
    linked.add(e.source);
    linked.add(e.target);
  }
  const connected = nodes.filter((n) => linked.has(n.id));
  const isolated = nodes.filter((n) => !linked.has(n.id));
  const out = new Map<string, Position>();

  let right = 0;
  let bottom = 0;
  if (connected.length) {
    const g = new dagre.graphlib.Graph({ multigraph: false });
    g.setGraph({ rankdir: "LR", nodesep: GAP_X, ranksep: 96, marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of connected) g.setNode(n.id, { width: n.width, height: n.height });
    for (const e of edges) if (e.source !== e.target && !g.hasEdge(e.source, e.target)) g.setEdge(e.source, e.target);
    dagre.layout(g);
    for (const n of connected) {
      const p = g.node(n.id);
      const x = Math.round(p.x - n.width / 2);
      const y = Math.round(p.y - n.height / 2);
      out.set(n.id, { x, y });
      right = Math.max(right, x + n.width);
      bottom = Math.max(bottom, y + n.height);
    }
  }
  if (isolated.length) {
    // Columns as tall as the connected part (at least four tables each), left to right.
    const limit = Math.max(bottom, isolated.slice(0, 4).reduce((a, n) => a + n.height + GAP_Y, 0));
    let x = connected.length ? right + 96 : 0;
    let y = 0;
    let colWidth = 0;
    for (const n of isolated) {
      if (y > 0 && y + n.height > limit) {
        x += colWidth + GAP_X;
        y = 0;
        colWidth = 0;
      }
      out.set(n.id, { x, y });
      y += n.height + GAP_Y;
      colWidth = Math.max(colWidth, n.width);
    }
  }
  return out;
}

/* ---------- Highlighting ---------- */

/** The nodes and edges to light up when `nodeId` or `edgeId` is hovered. */
export function neighbourhood(graph: Graph, hover: { node?: string; edge?: string }): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  for (const e of graph.edges) {
    if ((hover.node && (e.source === hover.node || e.target === hover.node)) || (hover.edge && e.id === hover.edge)) {
      edges.add(e.id);
      nodes.add(e.source);
      nodes.add(e.target);
    }
  }
  if (hover.node) nodes.add(hover.node);
  return { nodes, edges };
}

/* ---------- Mermaid ---------- */

const typeAliases: [RegExp, string][] = [
  [/^character varying/, "varchar"],
  [/^timestamp with time zone/, "timestamptz"],
  [/^timestamp without time zone/, "timestamp"],
  [/^time with time zone/, "timetz"],
  [/^time without time zone/, "time"],
  [/^double precision/, "float8"],
  [/^bit varying/, "varbit"],
];

/** A column type Mermaid's `erDiagram` accepts: no spaces. */
export function mermaidType(dataType: string): string {
  let t = dataType;
  for (const [re, alias] of typeAliases) t = t.replace(re, alias);
  return t.replace(/\s+/g, "_");
}

const mermaidName = (schema: string, table: string, qualify: boolean) => (qualify ? `${schema}_${table}` : table).replace(/[^A-Za-z0-9_]/g, "_");

/**
 * The diagram as a Mermaid `erDiagram`: every drawn table with its columns
 * (type, name, PK/FK/UK), then one relation per foreign key from the
 * referenced table to the referencing one, labelled with the columns.
 */
export function toMermaid(graph: Graph): string {
  const qualify = new Set(graph.nodes.map((n) => n.data.table.schema)).size > 1;
  const lines = ["erDiagram"];
  for (const n of graph.nodes) {
    const t = n.data.table;
    lines.push(`  ${mermaidName(t.schema, t.name, qualify)} {`);
    for (const c of n.data.columns) {
      const keys: string[] = [];
      if (c.is_primary_key) keys.push("PK");
      if (c.fk_targets?.length) keys.push("FK");
      if (c.is_unique && !c.is_primary_key) keys.push("UK");
      const comment = c.is_nullable ? ' "nullable"' : "";
      lines.push(`    ${mermaidType(c.data_type)} ${c.name.replace(/[^A-Za-z0-9_]/g, "_")}${keys.length ? ` ${keys.join(", ")}` : ""}${comment}`);
    }
    lines.push("  }");
  }
  const seen = new Set<string>();
  for (const e of graph.edges) {
    const fk = e.fk;
    const key = edgeId(fk);
    if (seen.has(key)) continue;
    seen.add(key);
    const from = mermaidName(fk.ref_schema, fk.ref_table, qualify);
    const to = mermaidName(fk.schema, fk.table, qualify);
    lines.push(`  ${from} ||--o{ ${to} : "${fk.columns.join(", ")}"`);
  }
  return lines.join("\n") + "\n";
}
