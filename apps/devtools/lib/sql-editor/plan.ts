import type { PlanNode, PlanRoot } from "../api/sql";

/**
 * `EXPLAIN (FORMAT JSON)` as a flat list for the tree view: every node with
 * its depth, its parent, and what it cost on its own (its total minus its
 * children's), so the costliest steps stand out rather than the root, which
 * always carries the whole sum.
 */

export type FlatPlanNode = {
  id: string;
  parentId?: string;
  depth: number;
  node: PlanNode;
  /** Total Cost minus the children's Total Cost. */
  ownCost: number;
  /** Actual Total Time × loops minus the children's, when analyzed. */
  ownTime?: number;
  hasChildren: boolean;
};

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function flattenPlan(plan: PlanRoot[]): FlatPlanNode[] {
  const out: FlatPlanNode[] = [];
  plan.forEach((root, i) => walk(root.Plan, `${i}`, undefined, 0, out));
  return out;
}

function walk(node: PlanNode, id: string, parentId: string | undefined, depth: number, out: FlatPlanNode[]) {
  const children = node.Plans ?? [];
  const analyzed = typeof node["Actual Total Time"] === "number";
  const childCost = children.reduce((s, c) => s + num(c["Total Cost"]), 0);
  const time = (n: PlanNode) => num(n["Actual Total Time"]) * Math.max(1, num(n["Actual Loops"]));
  const childTime = children.reduce((s, c) => s + time(c), 0);
  out.push({
    id,
    parentId,
    depth,
    node,
    ownCost: Math.max(0, num(node["Total Cost"]) - childCost),
    ownTime: analyzed ? Math.max(0, time(node) - childTime) : undefined,
    hasChildren: children.length > 0,
  });
  children.forEach((c, i) => walk(c, `${id}.${i}`, id, depth + 1, out));
}

/** The ids of the `n` costliest nodes by own time when analyzed, else by own cost; nodes that cost nothing never rank. */
export function costliest(nodes: FlatPlanNode[], n = 3): Set<string> {
  const analyzed = nodes.some((x) => x.ownTime !== undefined);
  const score = (x: FlatPlanNode) => (analyzed ? (x.ownTime ?? 0) : x.ownCost);
  const ranked = nodes.filter((x) => score(x) > 0).sort((a, b) => score(b) - score(a));
  return new Set(ranked.slice(0, n).map((x) => x.id));
}

/** The share of the plan's total this node's own cost (or time) is, 0..1. */
export function costShare(node: FlatPlanNode, nodes: FlatPlanNode[]): number {
  const analyzed = nodes.some((x) => x.ownTime !== undefined);
  const total = nodes.reduce((s, x) => s + (analyzed ? (x.ownTime ?? 0) : x.ownCost), 0);
  if (total <= 0) return 0;
  return (analyzed ? (node.ownTime ?? 0) : node.ownCost) / total;
}

/** One line describing the node: "Index Scan using projects_pkey on projects". */
export function nodeTitle(node: PlanNode): string {
  let title = node["Node Type"];
  if (node["Join Type"] && /Join/.test(title)) title = `${node["Join Type"]} ${title}`;
  if (node["Index Name"]) title += ` using ${node["Index Name"]}`;
  if (node["Relation Name"]) title += ` on ${node["Relation Name"]}${node.Alias && node.Alias !== node["Relation Name"] ? ` ${node.Alias}` : ""}`;
  if (node.Strategy && !node["Relation Name"]) title += ` (${node.Strategy})`;
  return title;
}

/** The conditions worth showing under a node, in order. */
export function nodeConditions(node: PlanNode): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const add = (label: string, v: unknown) => {
    if (typeof v === "string" && v) out.push({ label, value: v });
    else if (Array.isArray(v) && v.length) out.push({ label, value: v.map(String).join(", ") });
  };
  add("Index Cond", node["Index Cond"]);
  add("Recheck Cond", node["Recheck Cond"]);
  add("Hash Cond", node["Hash Cond"]);
  add("Merge Cond", node["Merge Cond"]);
  add("Join Filter", node["Join Filter"]);
  add("Filter", node.Filter);
  add("Sort Key", node["Sort Key"]);
  add("Group Key", node["Group Key"]);
  return out;
}
