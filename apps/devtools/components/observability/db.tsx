"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock, RefreshCw, Timer } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { Empty, KeyList, Legend, Panel } from "@gorbital/dash/components/panel";
import { Bar, Split } from "@gorbital/dash/components/progress";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Table } from "@gorbital/dash/components/table";
import { useTableSort } from "@gorbital/dash/components/table-sort";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { theme, toneColor } from "@gorbital/dash/theme";
import { useDbStats, type Activity, type ClientUse, type LockWait, type RelationSize } from "@/lib/api/observability";
import { useCapabilities, useSystem } from "@/lib/api/queries";
import { bytes, count, millis, millisFromString, oneLine, percent } from "@/lib/observability/format";
import { connectionsGrade, gradeTone } from "@/lib/observability/grade";
import { ago, when } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { HitGauge, NoDatabase, Stat } from "./common";

const stateColor: Record<string, string> = { active: theme.primary, idle: theme.muted, "idle in transaction": theme.warn, "idle in transaction (aborted)": theme.danger, fastpath: theme.info, disabled: theme.faint };

/** Item 65: connections against max_connections, the pool, cache and index hit gauges, transactions, the largest tables, lock waits and long statements. */
export function DatabaseTab() {
  const caps = useCapabilities();
  const noDatabase = caps.status.data?.portal.database === false;
  const stats = useDbStats(!noDatabase);
  const system = useSystem(caps.ops && caps.database);
  const now = useNow();
  const { sort, onSort } = useTableSort({ key: "total", dir: "desc" });
  const [expanded, setExpanded] = useState<number | null>(null);
  const s = stats.data;
  const pool = system.data?.database.pool;
  const connGrade = s ? connectionsGrade(s.connections, s.max_connections) : "good";
  const states = s ? [...new Set(s.clients.map((c) => c.state))] : [];
  const byState = (state: string) => (s?.clients ?? []).filter((c) => c.state === state).reduce((a, c) => a + c.count, 0);

  if (noDatabase) return <NoDatabase />;
  if (stats.error && !s) return <ProblemPanel error={stats.error} scope="portal" meta="GET /_portal/api/db/stats" onRetry={() => void stats.refetch()} retrying={stats.isFetching} />;

  return (
    <div className="flex flex-col gap-3">
      <TileGrid cols={5}>
        <Tile label="Connections" value={s ? String(s.connections) : "—"} unit={s ? `of ${s.max_connections}` : undefined} hero loading={stats.isPending} deltaTone={connGrade === "poor" ? "bad" : connGrade === "ok" ? "flat" : "good"} footer={s ? `${s.clients.length} application/state pairs` : undefined} />
        <Tile label="Database" value={s ? bytes(s.size) : "—"} loading={stats.isPending} footer={s ? `${s.database} · ${s.version.split(" on ")[0]}` : undefined} />
        <Tile label="Commits" value={s ? count(s.commits) : "—"} loading={stats.isPending} footer={s ? `${count(s.rollbacks)} rollbacks · ${s.stats_since ? `since ${when(s.stats_since)}` : "since the last reset"}` : undefined} />
        <Tile label="Deadlocks" value={s ? count(s.deadlocks) : "—"} loading={stats.isPending} deltaTone={s && s.deadlocks > 0 ? "bad" : "flat"} footer={s ? `${bytes(s.temp_bytes)} written to temp files` : undefined} />
        <Tile label="Waiting" value={s ? String(s.locks.length) : "—"} unit={s ? `on locks · ${s.long_running.length} long` : undefined} loading={stats.isPending} deltaTone={s && (s.locks.length > 0 || s.long_running.length > 0) ? "bad" : "flat"} footer="sessions right now" />
      </TileGrid>
      <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-3">
        <div className="flex flex-col gap-3">
          <Panel title="Connections" meta={s ? `${s.connections} of max_connections ${s.max_connections}` : undefined} actions={s && <Badge tone={gradeTone[connGrade]}>{percent(s.connections / Math.max(1, s.max_connections), 0)} used</Badge>}>
            {!s ? (
              <SkeletonLines lines={5} />
            ) : (
              <div className="grid gap-3">
                <Bar value={s.connections} max={s.max_connections} color={toneColor[gradeTone[connGrade]]} height={6} />
                <Split parts={states.map((st) => ({ value: byState(st), color: stateColor[st] ?? theme.violet }))} height={4} />
                <Legend items={states.map((st) => ({ label: st || "(no state)", color: stateColor[st] ?? theme.violet, value: String(byState(st)) }))} />
                <Table<ClientUse>
                  rows={s.clients}
                  rowKey={(c) => `${c.application}|${c.state}`}
                  dense
                  columns={[
                    { key: "app", header: "Application", cell: (c) => <span className="font-mono text-text">{c.application || <span className="text-dim">(no application_name)</span>}</span> },
                    { key: "state", header: "State", width: "200px", cell: (c) => <Badge tone={c.state === "active" ? "accent" : c.state.startsWith("idle in transaction") ? "warn" : "muted"}>{c.state}</Badge> },
                    { key: "count", header: "Sessions", width: "90px", align: "right", cell: (c) => <span className="font-mono text-text tnum">{c.count}</span> },
                  ]}
                  empty={<Empty title="No client sessions" />}
                />
              </div>
            )}
          </Panel>
          <Panel title="Largest tables" meta="/_portal/api/db/stats · top 50 by total size" flush>
            <Table<RelationSize>
              rows={s?.tables ?? []}
              rowKey={(t) => `${t.schema}.${t.name}`}
              loading={stats.isPending}
              sort={sort}
              onSort={onSort}
              dense
              columns={[
                {
                  key: "name",
                  header: "Table",
                  sortValue: (t) => `${t.schema}.${t.name}`,
                  cell: (t) => (
                    <Link href={`/database/tables?schema=${encodeURIComponent(t.schema)}&table=${encodeURIComponent(t.name)}`} className="font-mono text-text hover:underline">
                      {t.schema !== "public" && <span className="text-dim">{t.schema}.</span>}
                      {t.name}
                    </Link>
                  ),
                },
                { key: "total", header: "Total", width: "90px", align: "right", sortValue: (t) => t.total, cell: (t) => <span className="font-mono text-text tnum">{bytes(t.total)}</span> },
                { key: "table", header: "Table", width: "80px", align: "right", sortValue: (t) => t.table, cell: (t) => <span className="font-mono text-dim tnum">{bytes(t.table)}</span> },
                { key: "indexes", header: "Indexes", width: "80px", align: "right", sortValue: (t) => t.indexes, cell: (t) => <span className="font-mono text-dim tnum">{bytes(t.indexes)}</span> },
                { key: "toast", header: "Toast", width: "80px", align: "right", sortValue: (t) => t.toast, cell: (t) => <span className="font-mono text-dim tnum">{t.toast > 0 ? bytes(t.toast) : "—"}</span> },
                { key: "rows", header: "Rows", width: "90px", align: "right", sortValue: (t) => t.rows, cell: (t) => <span className="font-mono text-dim tnum">{count(t.rows)}</span> },
                {
                  key: "scans",
                  header: "Seq / idx scans",
                  width: "170px",
                  align: "right",
                  sortValue: (t) => (t.seq_scans + t.index_scans > 0 ? t.seq_scans / (t.seq_scans + t.index_scans) : 0),
                  cell: (t) => (
                    <span className="inline-flex items-center justify-end gap-2">
                      <span className="inline-block w-10">
                        <Split parts={[{ value: t.seq_scans, color: theme.warn }, { value: t.index_scans, color: theme.primary }]} height={3} />
                      </span>
                      <span className="font-mono text-dim tnum">
                        {count(t.seq_scans)} / {count(t.index_scans)}
                      </span>
                    </span>
                  ),
                },
                { key: "dead", header: "Dead", width: "80px", align: "right", sortValue: (t) => t.dead_rows, cell: (t) => <span className={`font-mono tnum ${t.rows > 0 && t.dead_rows > t.rows / 5 ? "text-warn" : "text-dim"}`}>{count(t.dead_rows)}</span> },
                { key: "vac", header: "Last vacuum", width: "110px", align: "right", sortValue: (t) => (t.last_vacuum ? Date.parse(t.last_vacuum) : 0), cell: (t) => <span className="font-mono text-[11px] text-dim tnum">{t.last_vacuum ? ago(t.last_vacuum, now) : "never"}</span> },
              ]}
              empty={<Empty title="No tables" hint="The database has no user tables yet." />}
            />
          </Panel>
        </div>
        <div className="flex flex-col gap-3">
          <Panel title="Cache" meta="hits over reads, since the reset">
            {!s ? (
              <SkeletonLines lines={4} />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <HitGauge ratio={s.cache_hit_ratio} caption="shared buffers" />
                <HitGauge ratio={s.index_hit_ratio} caption="index blocks" />
              </div>
            )}
          </Panel>
          <Panel title="Connection pool" meta={pool ? `${pool.total} open · /ops/system` : "/ops/system"}>
            {!caps.running ? (
              <p className="text-[12px] text-dim">The app isn&apos;t running; the pool lives inside it.</p>
            ) : !caps.ops ? (
              <p className="text-[12px] text-dim">No ops API in this app.</p>
            ) : !pool ? (
              <SkeletonLines lines={5} />
            ) : (
              <div className="grid gap-3">
                <Bar value={pool.in_use} max={pool.max} color={theme.primary} height={4} />
                <KeyList
                  rows={[
                    { k: "In use", v: `${pool.in_use} of ${pool.max}` },
                    { k: "Idle", v: String(pool.idle) },
                    { k: "Acquires", v: count(pool.acquires) },
                    { k: "Average acquire", v: `${pool.average_acquire_ms.toFixed(2)} ms` },
                    { k: "Waited", v: `${count(pool.empty_acquires)} times` },
                    { k: "Cancelled", v: count(pool.canceled_acquires) },
                    { k: "Ping", v: `${system.data?.database.ping_ms ?? "—"} ms` },
                  ]}
                />
              </div>
            )}
          </Panel>
          <Panel title="Transactions" meta={s?.stats_since ? `since ${when(s.stats_since)}` : "since the last statistics reset"}>
            {!s ? (
              <SkeletonLines lines={4} />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Commits" value={count(s.commits)} />
                <Stat label="Rollbacks" value={count(s.rollbacks)} tone={s.commits > 0 && s.rollbacks / s.commits > 0.05 ? "warn" : undefined} />
                <Stat label="Deadlocks" value={count(s.deadlocks)} tone={s.deadlocks > 0 ? "danger" : undefined} />
                <Stat label="Temp bytes" value={bytes(s.temp_bytes)} tone={s.temp_bytes > 1_073_741_824 ? "warn" : undefined} />
              </div>
            )}
          </Panel>
        </div>
      </div>
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Lock size={13} className={s && s.locks.length > 0 ? "text-danger" : "text-dim"} /> Lock waits
          </span>
        }
        meta="pg_locks · sessions waiting, with who blocks them"
        flush
      >
        <Table<LockWait>
          rows={s?.locks ?? []}
          rowKey={(l) => String(l.pid)}
          loading={stats.isPending}
          dense
          columns={[
            { key: "pid", header: "PID", width: "80px", cell: (l) => <span className="font-mono text-text tnum">{l.pid}</span> },
            { key: "app", header: "Application", width: "140px", cell: (l) => <span className="font-mono text-muted">{l.application || "—"}</span> },
            { key: "wait", header: "Waiting statement", cell: (l) => <span className="block max-w-[520px] truncate font-mono text-[11px] text-text" title={l.waiting}>{oneLine(l.waiting, 160)}</span> },
            { key: "lock", header: "Lock", width: "200px", cell: (l) => <span className="font-mono text-[11px] text-dim">{l.lock_type} · {l.mode}{l.relation ? ` on ${l.relation}` : ""}</span> },
            { key: "by", header: "Blocked by", width: "140px", cell: (l) => <span className="flex flex-wrap gap-1">{l.blocked_by.length ? l.blocked_by.map((pid) => <Badge key={pid} tone="danger">{pid}</Badge>) : <span className="text-dim">—</span>}</span> },
            { key: "for", header: "For", width: "90px", align: "right", cell: (l) => <span className="font-mono text-warn tnum">{millisFromString(l.waiting_for_ms)}</span> },
          ]}
          empty={<Empty title="Nothing waits on a lock" hint="Sessions blocked by another session's lock appear here with the blocking PIDs." />}
        />
      </Panel>
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Timer size={13} className={s && s.long_running.length > 0 ? "text-warn" : "text-dim"} /> Long-running statements
          </span>
        }
        meta="pg_stat_activity · in a statement for over a second"
        flush
      >
        <Table<Activity>
          rows={s?.long_running ?? []}
          rowKey={(a) => String(a.pid)}
          loading={stats.isPending}
          dense
          onRowClick={(a) => setExpanded((e) => (e === a.pid ? null : a.pid))}
          columns={[
            { key: "pid", header: "PID", width: "80px", cell: (a) => <span className="font-mono text-text tnum">{a.pid}</span> },
            { key: "app", header: "Application", width: "140px", cell: (a) => <span className="font-mono text-muted">{a.application || "—"}</span> },
            { key: "state", header: "State", width: "170px", cell: (a) => <Badge tone={a.state === "active" ? "accent" : a.state.startsWith("idle in transaction") ? "warn" : "muted"}>{a.state}</Badge> },
            { key: "q", header: "Statement", cell: (a) => (expanded === a.pid ? <Code className="my-1 max-h-48 whitespace-pre-wrap text-[11px]">{a.query}</Code> : <span className="block max-w-[520px] truncate font-mono text-[11px] text-text">{oneLine(a.query, 160)}</span>) },
            { key: "wait", header: "Wait event", width: "130px", cell: (a) => <span className="font-mono text-[11px] text-dim">{a.wait_event || "—"}</span> },
            { key: "for", header: "For", width: "100px", align: "right", cell: (a) => <span className={`font-mono tnum ${a.duration_ms > 30_000 ? "text-danger" : "text-warn"}`}>{millis(a.duration_ms)}</span> },
          ]}
          empty={<Empty title="No long statements" hint="Statements running for more than a second show up here; click one to read it whole." />}
        />
      </Panel>
      <div className="flex items-center gap-2 font-mono text-[11px] text-dim">
        <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />} onClick={() => void Promise.all([stats.refetch(), system.refetch()])} loading={stats.isFetching}>
          Refresh
        </Button>
        every 10 s · pgmeta reads pg_stat_database, pg_stat_activity, pg_locks and the relation sizes in a read-only transaction
      </div>
    </div>
  );
}
