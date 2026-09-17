"use client";

import { useState } from "react";
import { AlertTriangle, Play, RefreshCw } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { ConfirmDialog } from "@gorbital/dash/components/dialog";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Bar } from "@gorbital/dash/components/progress";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Table } from "@gorbital/dash/components/table";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { fmtBytes, fmtDuration, fmtInt } from "@gorbital/dash/lib/format";
import { theme } from "@gorbital/dash/theme";
import { useCapabilities, useDevMigrations, useMigrate, useSystem } from "@/lib/api/queries";
import type { SystemCheck } from "@/lib/api/types";
import { when } from "@/lib/time";
import { SchemaNotice } from "@/components/database/schema-notice";
import { Gate } from "@/components/shared/gate";
import { ProblemPanel } from "@/components/shared/problem-panel";

export function Database() {
  const caps = useCapabilities();
  const migrations = useDevMigrations(caps.console && caps.database);
  const system = useSystem(caps.ops && caps.database);
  const migrate = useMigrate();
  const [confirm, setConfirm] = useState(false);

  const m = migrations.data ?? system.data?.database.migrations;
  const pending = m?.pending ?? 0;
  const db = system.data?.database;
  const checks = system.data?.checks ?? [];
  const failed = checks.filter((c) => c.status !== "ok").length;

  return (
    <>
      <PageHeader product="devtools" title="Database" description={system.data ? `${db?.status === "ok" ? "PostgreSQL reachable" : "PostgreSQL failing"} · ping ${db?.ping_ms} ms · pool ${db?.pool.in_use}/${db?.pool.max} · /ops/system` : "migrations, the pool and the health checks of the running instance"}>
        <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />} onClick={() => void Promise.all([migrations.refetch(), system.refetch()])} loading={system.isFetching || migrations.isFetching}>
          Refresh
        </Button>
        <Button size="sm" kind="primary" icon={<Play size={11} />} onClick={() => setConfirm(true)} disabled={!caps.running || pending === 0} loading={migrate.isPending}>
          Apply pending migrations{pending > 0 ? ` (${pending})` : ""}
        </Button>
      </PageHeader>
      <Page>
        <Gate need="database" loading={<SkeletonLines lines={6} className="p-4" />}>
          <SchemaNotice />
          <TileGrid>
            <Tile
              label="Migrations"
              value={m ? (pending > 0 ? String(pending) : "0") : "—"}
              unit={m ? (pending > 0 ? "pending" : "pending · up to date") : undefined}
              hero
              loading={!m && (migrations.isPending || system.isPending)}
              deltaTone={pending > 0 ? "bad" : "good"}
              footer={m ? `current ${m.current} · latest ${m.latest}${migrations.data ? "" : " · from /ops/system"}` : undefined}
            />
            <Tile label="Pool" value={db ? String(db.pool.in_use) : "—"} unit={db ? `of ${db.pool.max} in use` : undefined} loading={system.isPending} footer={db ? `${db.pool.idle} idle · ${fmtInt(db.pool.acquires)} acquires · ${db.pool.average_acquire_ms.toFixed(2)} ms avg` : undefined} />
            <Tile label="Health checks" value={system.data ? String(checks.length - failed) : "—"} unit={system.data ? `of ${checks.length} ok` : undefined} loading={system.isPending} deltaTone={failed > 0 ? "bad" : "flat"} delta={failed > 0 ? `${failed} failed` : undefined} footer="as /readyz runs them" />
            <Tile label="Runtime" value={system.data ? fmtInt(system.data.runtime.goroutines) : "—"} unit="goroutines" loading={system.isPending} footer={system.data ? `${fmtBytes(system.data.runtime.heap_in_use_bytes)} heap · ${system.data.runtime.gcs} GCs · ${system.data.runtime.go_version}` : undefined} />
          </TileGrid>
          {system.error && !system.data && (
            <ProblemPanel error={system.error} scope="ops" console={caps.consoleDeclared} meta="GET /ops/system" onRetry={() => void system.refetch()} retrying={system.isFetching} />
          )}
          {migrations.error && !migrations.data && !system.data && (
            <ProblemPanel error={migrations.error} scope="dev" console={caps.consoleDeclared} meta="GET /_dev/migrations" onRetry={() => void migrations.refetch()} retrying={migrations.isFetching} />
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-3">
            <div className="flex flex-col gap-3">
              <Panel title="Migrations" meta="the app's migration files against the schema" flush>
                {!m ? (
                  <SkeletonLines lines={3} className="p-4" />
                ) : (
                  <ul>
                    {pending > 0 && (
                      <li className="flex items-center gap-3 border-b border-hairline bg-warn/5 px-4 py-2.5">
                        <AlertTriangle size={13} className="text-warn" />
                        <span className="text-[12px] text-text">
                          {pending} migration{pending === 1 ? "" : "s"} not applied: versions after <span className="font-mono">{m.current}</span> up to <span className="font-mono">{m.latest}</span>
                        </span>
                        <Badge tone="warn">pending</Badge>
                        <span className="ml-auto font-mono text-[11px] text-dim">orb dev applies them without a restart</span>
                      </li>
                    )}
                    <li className="flex items-center gap-3 border-t border-hairline px-4 py-2.5 first:border-0">
                      <Dot tone="ok" />
                      <span className="font-mono text-[12px] text-text">current {m.current}</span>
                      <span className="ml-auto font-mono text-[11px] text-dim">highest applied version</span>
                    </li>
                    <li className="flex items-center gap-3 border-t border-hairline px-4 py-2.5">
                      <Dot tone={pending > 0 ? "warn" : "ok"} />
                      <span className="font-mono text-[12px] text-text">latest {m.latest}</span>
                      <span className="ml-auto font-mono text-[11px] text-dim">newest migration file</span>
                    </li>
                  </ul>
                )}
              </Panel>
              <Panel title="Health checks" meta="/ops/system · every 10 s" flush>
                <Table<SystemCheck>
                  rows={checks}
                  rowKey={(c) => c.name}
                  loading={system.isPending}
                  dense
                  columns={[
                    {
                      key: "n",
                      header: "Check",
                      cell: (c) => (
                        <span className="flex items-center gap-2 font-mono text-text">
                          <Dot tone={c.status === "ok" ? "ok" : "danger"} />
                          {c.name}
                        </span>
                      ),
                    },
                    { key: "s", header: "Status", width: "90px", cell: (c) => <Badge tone={c.status === "ok" ? "ok" : "danger"}>{c.status}</Badge> },
                    { key: "d", header: "Took", width: "90px", align: "right", cell: (c) => <span className="font-mono text-dim tnum">{c.duration_ms} ms</span> },
                  ]}
                  empty={<Empty title="No checks" hint={system.error ? "The ops API didn't answer." : "The app registers no readiness checks."} />}
                />
              </Panel>
            </div>
            <div className="flex flex-col gap-3">
              <Panel title="Connection pool" meta={db ? `${db.pool.total} open` : undefined}>
                {!db ? (
                  <SkeletonLines lines={5} />
                ) : (
                  <div className="grid gap-3">
                    <Bar value={db.pool.in_use} max={db.pool.max} color={theme.primary} height={4} />
                    <KeyList
                      rows={[
                        { k: "In use", v: `${db.pool.in_use} of ${db.pool.max}` },
                        { k: "Idle", v: String(db.pool.idle) },
                        { k: "Acquires", v: fmtInt(db.pool.acquires) },
                        { k: "Average acquire", v: `${db.pool.average_acquire_ms.toFixed(2)} ms` },
                        { k: "Waited", v: `${fmtInt(db.pool.empty_acquires)} times` },
                        { k: "Cancelled", v: fmtInt(db.pool.canceled_acquires) },
                        { k: "Ping", v: `${db.ping_ms} ms` },
                        { k: "Status", v: db.error ? `${db.status} · ${db.error}` : db.status },
                      ]}
                    />
                  </div>
                )}
              </Panel>
              <Panel title="Instance" meta={system.data ? system.data.instance.id.slice(0, 12) : undefined}>
                {!system.data ? (
                  <SkeletonLines lines={5} />
                ) : (
                  <KeyList
                    rows={[
                      { k: "Version", v: `${system.data.instance.version}${system.data.instance.modified ? " (modified)" : ""}` },
                      { k: "Commit", v: system.data.instance.commit?.slice(0, 12) ?? "—" },
                      { k: "Built", v: system.data.instance.build_time ? when(system.data.instance.build_time) : "—" },
                      { k: "Started", v: when(system.data.instance.started_at) },
                      { k: "Uptime", v: fmtDuration(system.data.instance.uptime_seconds) },
                      { k: "Workers", v: `${system.data.jobs.workers} on ${(system.data.jobs.queues ?? []).join(", ") || "no queues"}` },
                      { k: "GOMAXPROCS", v: String(system.data.runtime.gomaxprocs) },
                      { k: "Last GC pause", v: `${system.data.runtime.last_gc_pause_ms.toFixed(2)} ms` },
                    ]}
                  />
                )}
              </Panel>
            </div>
          </div>
        </Gate>
      </Page>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Apply ${pending} pending migration${pending === 1 ? "" : "s"}?`}
        description={`orb dev runs the app's migrator (go run ./cmd/migrate) against its database, without restarting the app. Versions after ${m?.current ?? "?"} up to ${m?.latest ?? "?"} are applied; the console shows the output.`}
        confirmLabel="Apply"
        loading={migrate.isPending}
        onConfirm={() => migrate.mutate(undefined, { onSettled: () => setConfirm(false) })}
      />
    </>
  );
}
