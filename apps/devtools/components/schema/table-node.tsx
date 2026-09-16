"use client";

import { memo } from "react";
import Link from "next/link";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Eye, Fingerprint, KeyRound, Layers, Link2, Table2 } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import type { Tone } from "@gorbital/dash/theme";
import type { Ownership, TableKind } from "@/lib/api/schema";
import { HEADER_HEIGHT, NODE_WIDTH, ROW_HEIGHT, handleId, type TableNodeData } from "./graph";

/** What the page adds to a node's data while it renders: hovered or matched, or faded out. */
export type NodeFlags = { hot?: boolean; dim?: boolean };

export type TableFlowNode = Node<TableNodeData & NodeFlags, "table">;

export const ownershipTone: Record<Ownership, Tone> = { user: "accent", managed: "info", system: "muted" };

export function KindIcon({ kind, size = 12 }: { kind: TableKind; size?: number }) {
  if (kind === "view" || kind === "materialized_view") return <Eye size={size} />;
  if (kind === "partitioned_table") return <Layers size={size} />;
  return <Table2 size={size} />;
}

function TableNodeComponent({ data, selected }: NodeProps<TableFlowNode>) {
  const { table, columns, referenced, error, qualify, hot, dim } = data;
  return (
    <div className={`table-node ${hot ? "table-node--hot" : ""} ${dim ? "table-node--dim" : ""} ${selected ? "table-node--selected" : ""}`} style={{ width: NODE_WIDTH }}>
      <header className="table-node__header" style={{ height: HEADER_HEIGHT }}>
        <span className="text-dim">
          <KindIcon kind={table.kind} />
        </span>
        <Link href={`/database/tables?schema=${encodeURIComponent(table.schema)}&table=${encodeURIComponent(table.name)}`} className="nodrag min-w-0 flex-1 truncate font-mono text-[12px] font-semibold text-text hover:text-primary" title={`Open ${table.schema}.${table.name} in the Table Editor`}>
          {qualify && <span className="text-dim">{table.schema}.</span>}
          {table.name}
        </Link>
        <Badge tone={ownershipTone[table.ownership]} className="h-[16px] px-1 text-[9.5px]">
          {table.ownership}
        </Badge>
      </header>
      <ul className="table-node__rows">
        {error ? (
          <li className="table-node__row text-danger" style={{ height: ROW_HEIGHT }}>
            <AlertTriangle size={11} />
            <span className="truncate">{error}</span>
          </li>
        ) : columns.length === 0 ? (
          <li className="table-node__row text-dim" style={{ height: ROW_HEIGHT }}>
            <span className="truncate">no columns</span>
          </li>
        ) : (
          columns.map((c) => {
            const fk = Boolean(c.fk_targets?.length);
            const inbound = referenced.has(c.name);
            return (
              <li key={c.name} className="table-node__row" style={{ height: ROW_HEIGHT }} title={[c.data_type, c.is_nullable ? "nullable" : "not null", c.default_expr ? `default ${c.default_expr}` : "", fk ? `→ ${c.fk_targets?.join(", ")}` : ""].filter(Boolean).join(" · ")}>
                <Handle type="target" position={Position.Left} id={handleId(c.name, "in")} isConnectable={false} className={inbound ? "" : "handle--idle"} />
                <span className={`table-node__icon ${c.is_primary_key ? "text-warn" : fk ? "text-info" : c.is_unique ? "text-violet" : "text-faint"}`}>
                  {c.is_primary_key ? <KeyRound size={10} /> : fk ? <Link2 size={10} /> : c.is_unique ? <Fingerprint size={10} /> : null}
                </span>
                <span className={`truncate ${c.is_primary_key ? "font-semibold text-text" : "text-text"}`}>{c.name}</span>
                {c.is_nullable && (
                  <span className="text-faint" title="nullable">
                    ?
                  </span>
                )}
                <span className="table-node__type">{c.data_type}</span>
                <Handle type="source" position={Position.Right} id={handleId(c.name, "out")} isConnectable={false} className={fk ? "" : "handle--idle"} />
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

export const TableNode = memo(TableNodeComponent);
