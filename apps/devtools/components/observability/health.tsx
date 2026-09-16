"use client";

import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Table } from "@gorbital/dash/components/table";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { useServiceHealth, type ServiceHealth } from "@/lib/api/observability";
import { useCapabilities, useSystem } from "@/lib/api/queries";
import type { SystemCheck } from "@/lib/api/types";
import { millis } from "@/lib/observability/format";
import { healthTone, worstStatus } from "@/lib/observability/grade";
import { ago } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { StatusPill } from "./common";

/** Item 63: every service as orb dev checks it (every 10 s), and the app's own readiness checks from /ops/system. */
export function HealthTab() {
  const caps = useCapabilities();
  const health = useServiceHealth();
  const system = useSystem(caps.ops);
  const now = useNow();
  const services = health.data ?? [];
  const overall = worstStatus(services.map((s) => s.status));
  const byStatus = (s: ServiceHealth["status"]) => services.filter((x) => x.status === s).length;
  const checks = system.data?.checks ?? [];
  const failed = checks.filter((c) => c.status !== "ok").length;

  return (
    <div className="flex flex-col gap-3">
      <TileGrid>
        <Tile label="Overall" value={health.data ? overall : "—"} hero loading={health.isPending} icon={health.data ? <Dot tone={healthTone[overall]} pulse={overall !== "ok"} /> : undefined} footer={health.data ? `${services.length} service${services.length === 1 ? "" : "s"} checked` : "GET /_portal/api/health"} />
        <Tile label="Healthy" value={health.data ? String(byStatus("ok")) : "—"} loading={health.isPending} footer="answering as expected" />
        <Tile label="Degraded" value={health.data ? String(byStatus("degraded")) : "—"} loading={health.isPending} deltaTone={byStatus("degraded") > 0 ? "bad" : "flat"} footer="up, with something to look at" />
        <Tile label="Down" value={health.data ? String(byStatus("down") + byStatus("unknown")) : "—"} unit={health.data && byStatus("unknown") > 0 ? `${byStatus("unknown")} unknown` : undefined} loading={health.isPending} deltaTone={byStatus("down") > 0 ? "bad" : "flat"} footer="not answering, or not checked" />
      </TileGrid>
      {health.error && !health.data ? (
        <ProblemPanel error={health.error} scope="portal" meta="GET /_portal/api/health" onRetry={() => void health.refetch()} retrying={health.isFetching} />
      ) : (
        <Panel
          title="Services"
          meta="/_portal/api/health · every 10 s"
          flush
          actions={
            <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />} onClick={() => void health.refetch()} loading={health.isFetching}>
              Check now
            </Button>
          }
        >
          <Table<ServiceHealth>
            rows={services}
            rowKey={(s) => s.name}
            loading={health.isPending}
            columns={[
              { key: "name", header: "Service", width: "160px", cell: (s) => <span className="font-mono text-text">{s.name}</span> },
              { key: "status", header: "Status", width: "120px", cell: (s) => <StatusPill status={s.status} /> },
              { key: "detail", header: "Detail", cell: (s) => <span className="text-muted">{s.detail || "—"}</span> },
              { key: "version", header: "Version", width: "220px", cell: (s) => <span className="block max-w-[220px] truncate font-mono text-[11px] text-dim">{s.version || "—"}</span> },
              { key: "latency", header: "Latency", width: "90px", align: "right", cell: (s) => <span className="font-mono text-dim tnum">{s.latency_ms > 0 ? millis(s.latency_ms) : "—"}</span> },
              { key: "checked", header: "Checked", width: "100px", align: "right", cell: (s) => <span className="font-mono text-[11px] text-dim tnum">{ago(s.checked_at, now)}</span> },
              {
                key: "url",
                header: "",
                width: "36px",
                cell: (s) =>
                  s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-faint hover:text-text" aria-label={`Open ${s.name}`}>
                      <ExternalLink size={12} />
                    </a>
                  ) : null,
              },
            ]}
            empty={<Empty title="No services" hint="orb dev checks the app, PostgreSQL, Mailpit and the Compose services." />}
          />
        </Panel>
      )}
      <Panel title="Readiness checks" meta="/ops/system · as /readyz runs them" flush actions={system.data && <Badge tone={failed > 0 || system.data.database.status !== "ok" ? "danger" : "ok"}>{failed > 0 ? `${failed} failed` : "all ok"}</Badge>}>
        {!caps.running ? (
          <Empty title="App not running" hint="The readiness checks run inside the app; they fill in when it is up." />
        ) : !caps.ops ? (
          <Empty title="No ops API" hint="The Minimal preset has no /ops/system; the service table above still shows the app's readiness." />
        ) : system.error && !system.data ? (
          <ProblemPanel error={system.error} scope="ops" console={caps.consoleDeclared} meta="GET /ops/system" onRetry={() => void system.refetch()} retrying={system.isFetching} />
        ) : !system.data ? (
          <SkeletonLines lines={3} className="p-4" />
        ) : (
          <Table<SystemCheck>
            rows={checks}
            rowKey={(c) => c.name}
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
            empty={<Empty title="No checks" hint="The app registers no readiness checks." />}
          />
        )}
        {system.data && (
          <div className="flex items-center gap-2 border-t border-hairline px-4 py-2 text-[12px]">
            <Dot tone={system.data.database.migrations.pending > 0 ? "warn" : "ok"} />
            <Link href="/database" className="font-mono text-text hover:underline">
              migrations
            </Link>
            <span className="ml-auto font-mono text-[11px] text-dim tnum">{system.data.database.migrations.pending > 0 ? `${system.data.database.migrations.pending} pending · ${system.data.database.migrations.current} → ${system.data.database.migrations.latest}` : `up to date · ${system.data.database.migrations.current}`}</span>
          </div>
        )}
      </Panel>
    </div>
  );
}
