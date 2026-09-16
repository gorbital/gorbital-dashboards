"use client";

import Link from "next/link";
import { Broom, GitBranch, Lightbulb, RefreshCw, ScanSearch, Trash2 } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { useDbAdvice, type Advice, type AdviceGroup, type IndexAdvice } from "@/lib/api/observability";
import { useCapabilities } from "@/lib/api/queries";
import { bytes } from "@/lib/observability/format";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { CopyButton } from "@/components/auth/common";
import { NoDatabase, OpenInSqlEditorButton } from "./common";

const groups: { key: AdviceGroup; title: string; hint: string; icon: React.ReactNode }[] = [
  { key: "missing_fk_indexes", title: "Foreign keys without an index", hint: "deletes and updates on the referenced table scan the referencing one", icon: <GitBranch size={13} className="text-warn" /> },
  { key: "unused_indexes", title: "Unused indexes", hint: "never scanned since the statistics reset; not unique, not a primary key", icon: <Trash2 size={13} className="text-dim" /> },
  { key: "seq_scanned", title: "Sequentially scanned", hint: "large tables read mostly by sequential scans", icon: <ScanSearch size={13} className="text-info" /> },
  { key: "dead_rows", title: "Dead rows", hint: "tables waiting for a vacuum", icon: <Broom size={13} className="text-violet" /> },
];

/** Index and vacuum suggestions in four groups, each with its numbers and the SQL to run in the SQL editor. */
export function AdviceTab() {
  const caps = useCapabilities();
  const noDatabase = caps.status.data?.portal.database === false;
  const advice = useDbAdvice(!noDatabase);
  const a = advice.data;
  const total = a ? groups.reduce((n, g) => n + a[g.key].length, 0) : 0;

  if (noDatabase) return <NoDatabase />;
  if (advice.error && !a) return <ProblemPanel error={advice.error} scope="portal" meta="GET /_portal/api/db/advice" onRetry={() => void advice.refetch()} retrying={advice.isFetching} />;

  return (
    <div className="flex flex-col gap-3">
      <TileGrid>
        <Tile label="Suggestions" value={a ? String(total) : "—"} hero loading={advice.isPending} icon={<Lightbulb size={12} className="text-primary" />} footer="from the catalog and the statistics; judge them against real traffic" />
        {groups.slice(0, 3).map((g) => (
          <Tile key={g.key} label={g.title} value={a ? String(a[g.key].length) : "—"} loading={advice.isPending} deltaTone={a && a[g.key].length > 0 ? "flat" : "good"} footer={g.hint} />
        ))}
      </TileGrid>
      <div className="flex items-center gap-2">
        <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />} onClick={() => void advice.refetch()} loading={advice.isFetching}>
          Refresh
        </Button>
        <span className="font-mono text-[11px] text-dim">/_portal/api/db/advice · pg_constraint, pg_stat_user_indexes, pg_stat_user_tables</span>
      </div>
      {!a ? (
        <SkeletonLines lines={6} className="p-4" />
      ) : total === 0 ? (
        <Empty title="Nothing to suggest" hint="Every foreign key has an index, every index is used, no table is scanned sequentially and autovacuum keeps up." />
      ) : (
        groups.map((g) => <AdviceGroupPanel key={g.key} group={g} items={a[g.key]} />)
      )}
    </div>
  );
}

function AdviceGroupPanel({ group, items }: { group: (typeof groups)[number]; items: IndexAdvice[] }) {
  if (items.length === 0) return null;
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {group.icon} {group.title}
        </span>
      }
      meta={group.hint}
      actions={<Badge tone="muted">{items.length}</Badge>}
      flush
    >
      <ul>
        {items.map((it, i) => (
          <li key={`${it.schema}.${it.table}.${it.index ?? i}`} className="grid gap-2 border-t border-hairline px-4 py-3 first:border-0">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <Link href={`/database/tables?schema=${encodeURIComponent(it.schema)}&table=${encodeURIComponent(it.table)}`} className="font-mono text-text hover:underline">
                {it.schema !== "public" && <span className="text-dim">{it.schema}.</span>}
                {it.table}
              </Link>
              {it.index && <Badge tone="info">{it.index}</Badge>}
              {it.columns && it.columns.length > 0 && <span className="font-mono text-[11px] text-dim">({it.columns.join(", ")})</span>}
              {it.size !== undefined && it.size > 0 && <Badge tone="muted">{bytes(it.size)}</Badge>}
              {it.sql && (
                <span className="ml-auto flex items-center gap-1">
                  <CopyButton text={it.sql} />
                  <OpenInSqlEditorButton sql={`${it.sql}\n`} kind="secondary" />
                </span>
              )}
            </div>
            <p className="text-[12px] text-muted">{it.reason}</p>
            {it.sql && <Code className="whitespace-pre-wrap">{it.sql}</Code>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export type { Advice };
