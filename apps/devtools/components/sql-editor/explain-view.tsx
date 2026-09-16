"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Flame } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Code } from "@gorbital/dash/components/code";
import { Empty } from "@gorbital/dash/components/panel";
import { Segmented } from "@gorbital/dash/components/pill";
import { fmtMs } from "@gorbital/dash/lib/format";
import type { PlanRoot } from "@/lib/api/sql";
import { costShare, costliest, flattenPlan, nodeConditions, nodeTitle, type FlatPlanNode } from "@/lib/sql-editor/plan";

type Props = { plan?: PlanRoot[]; analyzed?: boolean; explaining: boolean };

/** `EXPLAIN (FORMAT JSON)` as a tree: every node with its costs, the costliest lit up, and the raw JSON a toggle away. */
export function ExplainView({ plan, analyzed, explaining }: Props) {
  const [view, setView] = useState<"tree" | "json">("tree");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const nodes = useMemo(() => (plan ? flattenPlan(plan) : []), [plan]);
  const hot = useMemo(() => costliest(nodes, 3), [nodes]);

  if (explaining && !plan) return <div className="flex h-full items-center justify-center text-[12px] text-dim">Explaining…</div>;
  if (!plan) return <Empty title="No plan yet" hint="Explain shows how PostgreSQL would run the statement; Analyze runs it (rolled back) and adds the actual figures." />;

  const root = plan[0];
  const visible = nodes.filter((n) => !hasCollapsedAncestor(n, nodes, collapsed));
  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-1.5">
        <Badge tone={analyzed ? "warn" : "info"}>{analyzed ? "EXPLAIN ANALYZE" : "EXPLAIN"}</Badge>
        {typeof root?.["Planning Time"] === "number" && <span className="font-mono text-[11px] text-dim tnum">planning {fmtMs(root["Planning Time"])}</span>}
        {typeof root?.["Execution Time"] === "number" && <span className="font-mono text-[11px] text-dim tnum">execution {fmtMs(root["Execution Time"])}</span>}
        <span className="font-mono text-[11px] text-faint">
          {nodes.length} node{nodes.length === 1 ? "" : "s"}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {hot.size > 0 && (
            <span className="flex items-center gap-1 font-mono text-[10.5px] text-dim">
              <Flame size={11} className="text-danger" /> costliest by {analyzed ? "own time" : "own cost"}
            </span>
          )}
          <Segmented
            className="h-7 text-[11px]"
            options={[
              { value: "tree", label: "Tree" },
              { value: "json", label: "JSON" },
            ]}
            value={view}
            onChange={setView}
          />
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {view === "json" ? (
          <Code className="m-3 max-h-none whitespace-pre text-[11px]">{JSON.stringify(plan, null, 2)}</Code>
        ) : (
          <ul className="py-1.5">
            {visible.map((n) => (
              <PlanRow key={n.id} n={n} nodes={nodes} hot={hot.has(n.id)} collapsed={collapsed.has(n.id)} onToggle={() => toggle(n.id)} analyzed={Boolean(analyzed)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function hasCollapsedAncestor(n: FlatPlanNode, nodes: FlatPlanNode[], collapsed: Set<string>): boolean {
  let parent = n.parentId;
  while (parent) {
    if (collapsed.has(parent)) return true;
    parent = nodes.find((x) => x.id === parent)?.parentId;
  }
  return false;
}

const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const fmt = (v: number | undefined, digits = 2) => (v === undefined ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: digits }));

function PlanRow({ n, nodes, hot, collapsed, onToggle, analyzed }: { n: FlatPlanNode; nodes: FlatPlanNode[]; hot: boolean; collapsed: boolean; onToggle: () => void; analyzed: boolean }) {
  const node = n.node;
  const share = costShare(n, nodes);
  const conditions = nodeConditions(node);
  const actualRows = num(node["Actual Rows"]);
  const planRows = num(node["Plan Rows"]);
  const misestimate = analyzed && actualRows !== undefined && planRows !== undefined && planRows > 0 && (actualRows / planRows > 10 || planRows / Math.max(1, actualRows) > 10);
  return (
    <li className={`relative border-l-2 ${hot ? "border-danger/60 bg-danger/5" : "border-transparent"}`} style={{ paddingLeft: 12 + n.depth * 18 }}>
      <div className="flex items-start gap-1.5 py-1 pr-3">
        <button type="button" onClick={onToggle} disabled={!n.hasChildren} className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded text-dim ${n.hasChildren ? "hover:bg-elevated hover:text-text" : "opacity-0"}`} aria-label={collapsed ? "Expand" : "Collapse"}>
          <ChevronRight size={11} className={`transition-transform ${collapsed ? "" : "rotate-90"}`} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={`font-mono text-[12px] ${hot ? "text-danger" : "text-text"}`}>{nodeTitle(node)}</span>
            {hot && <Flame size={11} className="text-danger" />}
            {node["Parent Relationship"] && typeof node["Parent Relationship"] === "string" && <span className="font-mono text-[10px] text-faint">{node["Parent Relationship"]}</span>}
            {share > 0 && (
              <span className="ml-auto flex items-center gap-1.5 font-mono text-[10.5px] text-dim tnum">
                <i className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-hairline">
                  <i className={`block h-full ${hot ? "bg-danger" : "bg-primary-mid"}`} style={{ width: `${Math.max(2, Math.round(share * 100))}%` }} />
                </i>
                {Math.round(share * 100)}%
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10.5px] text-dim tnum">
            <span>
              cost {fmt(num(node["Startup Cost"]))}..{fmt(num(node["Total Cost"]))}
            </span>
            <span>rows {fmt(planRows, 0)}</span>
            {num(node["Plan Width"]) !== undefined && <span>width {fmt(num(node["Plan Width"]), 0)}</span>}
            {analyzed && (
              <>
                <span className={misestimate ? "text-warn" : ""}>actual rows {fmt(actualRows, 0)}</span>
                <span>
                  time {fmt(num(node["Actual Startup Time"]), 3)}..{fmt(num(node["Actual Total Time"]), 3)} ms
                </span>
                {num(node["Actual Loops"]) !== undefined && num(node["Actual Loops"]) !== 1 && <span>loops {fmt(num(node["Actual Loops"]), 0)}</span>}
                {num(node["Rows Removed by Filter"]) !== undefined && <span>removed by filter {fmt(num(node["Rows Removed by Filter"]), 0)}</span>}
              </>
            )}
          </div>
          {conditions.length > 0 && (
            <dl className="mt-0.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-[10.5px]">
              {conditions.map((c) => (
                <div key={c.label} className="contents">
                  <dt className="text-faint">{c.label}</dt>
                  <dd className="truncate text-muted" title={c.value}>
                    {c.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </li>
  );
}
