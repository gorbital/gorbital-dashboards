"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Flame, Radio, RefreshCw, TriangleAlert } from "lucide-react";
import { Badge, Dot, Method } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Empty, Legend, Panel } from "@gorbital/dash/components/panel";
import { Segmented } from "@gorbital/dash/components/pill";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Table } from "@gorbital/dash/components/table";
import { useTableSort } from "@gorbital/dash/components/table-sort";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { AreaChart } from "@gorbital/dash/charts/area";
import { theme, toneColor } from "@gorbital/dash/theme";
import { observabilityRanges, useObservabilityOverview, useObservabilityRoutes, useObservabilityStream, type ObservabilityRange, type RouteTraffic } from "@/lib/api/observability";
import { useCapabilities } from "@/lib/api/queries";
import { count, millis, percent, rate } from "@/lib/observability/format";
import { errorRateGrade, gradeTone } from "@/lib/observability/grade";
import { fillMinutes, mostFailingRoutes, rangeLabel, routeKey, routeLabel, slowestRoutes } from "@/lib/observability/routes";
import { ago } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { Gate } from "@/components/shared/gate";
import { ProblemPanel } from "@/components/shared/problem-panel";

/** Item 64: request rate, error rate and percentiles over the range, per route, live from the stream while the tab is open. */
export function ApiTab() {
  return (
    <Gate need="ops" loading={<SkeletonLines lines={6} className="p-4" />}>
      <ApiBody />
    </Gate>
  );
}

function ApiBody() {
  const caps = useCapabilities();
  const [range, setRange] = useState<ObservabilityRange>("15m");
  const overview = useObservabilityOverview(range, caps.ops);
  const routes = useObservabilityRoutes(range, "requests", caps.ops);
  const stream = useObservabilityStream(range, caps.ops);
  const { sort, onSort } = useTableSort({ key: "requests", dir: "desc" });
  const now = useNow();
  const o = overview.data;
  const minutes = useMemo(() => (o ? fillMinutes(o.minutes, o.from, o.to) : []), [o]);
  const list = routes.data ?? [];
  const slowest = useMemo(() => (list.length ? slowestRoutes(list) : (o?.top_routes.by_latency ?? []).slice(0, 5)), [list, o]);
  const failing = useMemo(() => (list.length ? mostFailingRoutes(list) : (o?.top_routes.by_errors ?? []).slice(0, 5)), [list, o]);
  const errGrade = o ? errorRateGrade(o.error_rate) : "good";
  const labels = minutes.map((m) => new Date(m.minute).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  const instance = o?.instances?.[0];
  const staleWrite = instance ? now - Date.parse(instance.last_write) > 20_000 : false;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented options={observabilityRanges.map((r) => ({ value: r, label: rangeLabel[r] }))} value={range} onChange={setRange} />
        <span className="font-mono text-[11px] text-dim">{o ? `${new Date(o.from).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} → ${new Date(o.to).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · every instance` : "/ops/observability/overview"}</span>
        <span className="ml-auto flex items-center gap-2">
          {stream.state === "open" ? (
            <Badge tone="ok" className="gap-1.5">
              <Dot tone="ok" pulse /> live · every 5 s
            </Badge>
          ) : stream.state === "connecting" ? (
            <Badge tone="muted" className="gap-1.5">
              <Radio size={11} /> connecting…
            </Badge>
          ) : (
            <Badge tone="warn" className="gap-1.5">
              <Radio size={11} /> stream {stream.reason === "unauthorized" ? "refused" : "closed"} · retry in {Math.round(stream.retryIn / 1000)} s
            </Badge>
          )}
          <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />} onClick={() => void Promise.all([overview.refetch(), routes.refetch()])} loading={overview.isFetching || routes.isFetching}>
            Refresh
          </Button>
        </span>
      </div>
      {overview.error && !o ? (
        <ProblemPanel error={overview.error} scope="ops" console={caps.consoleDeclared} meta="GET /ops/observability/overview" onRetry={() => void overview.refetch()} retrying={overview.isFetching} />
      ) : (
        <>
          <TileGrid cols={5}>
            <Tile label="Requests" value={o ? rate(o.requests_per_minute) : "—"} hero loading={overview.isPending} spark={minutes.length > 1 ? minutes.map((m) => m.requests) : undefined} footer={o ? `${count(o.requests)} over ${rangeLabel[range]} · ${count(o.client_errors)} 4xx` : undefined} />
            <Tile
              label="Error rate"
              value={o ? percent(o.error_rate, 2) : "—"}
              unit={o ? `${count(o.server_errors)} 5xx` : undefined}
              loading={overview.isPending}
              deltaTone={errGrade === "poor" ? "bad" : errGrade === "ok" ? "flat" : "good"}
              spark={minutes.length > 1 ? minutes.map((m) => m.server_errors) : undefined}
              sparkColor={toneColor[gradeTone[errGrade]]}
              footer="server errors per request"
            />
            <Tile label="p50" value={o ? millis(o.latency_ms.p50) : "—"} loading={overview.isPending} footer={o ? `mean ${millis(o.latency_ms.mean)}` : undefined} />
            <Tile label="p95" value={o ? millis(o.latency_ms.p95) : "—"} loading={overview.isPending} spark={minutes.length > 1 ? minutes.map((m) => m.p95_ms) : undefined} sparkColor={theme.info} footer="estimated from the histogram" />
            <Tile label="p99" value={o ? millis(o.latency_ms.p99) : "—"} loading={overview.isPending} footer={o ? `max ${millis(o.latency_ms.max)}` : undefined} />
          </TileGrid>
          <Panel
            title="Requests per minute"
            meta={o ? `${minutes.length} minutes` : undefined}
            actions={
              instance && (
                <span className="flex items-center gap-2 font-mono text-[11px] text-dim">
                  {o?.instances && o.instances.length > 1 ? `${o.instances.length} instances` : `instance ${instance.instance_id.slice(0, 8)}`} · wrote {ago(instance.last_write, now)}
                  {staleWrite && <Badge tone="warn">stale</Badge>}
                </span>
              )
            }
          >
            {!o ? (
              <SkeletonLines lines={5} />
            ) : o.requests === 0 ? (
              <Empty title="No requests in this range" hint="Send some through the Routes page; instances write their minutes every 15 seconds." />
            ) : (
              <div className="grid gap-2">
                <AreaChart
                  height={180}
                  series={[
                    { name: "requests", data: minutes.map((m) => m.requests), color: theme.primary },
                    { name: "server errors", data: minutes.map((m) => m.server_errors), color: theme.danger },
                  ]}
                  labels={labels}
                />
                <Legend
                  items={[
                    { label: "requests", color: theme.primary, value: count(o.requests) },
                    { label: "server errors", color: theme.danger, value: count(o.server_errors) },
                  ]}
                />
              </div>
            )}
          </Panel>
          <div className="grid grid-cols-2 gap-3">
            <TopRoutes title="Slowest" meta="by p95" icon={<Flame size={13} className="text-warn" />} rows={slowest} value={(r) => millis(r.latency_ms.p95)} sub={(r) => `${count(r.requests)} req · p99 ${millis(r.latency_ms.p99)}`} loading={overview.isPending && routes.isPending} empty="No route has enough requests yet." />
            <TopRoutes title="Most failing" meta="by error rate" icon={<TriangleAlert size={13} className="text-danger" />} rows={failing} value={(r) => percent(r.error_rate, 2)} sub={(r) => `${count(r.server_errors)} 5xx of ${count(r.requests)}`} loading={overview.isPending && routes.isPending} empty="No server errors in this range." />
          </div>
          <Panel title="Routes" meta={`/ops/observability/routes · ${list.length} pattern${list.length === 1 ? "" : "s"}`} flush>
            {routes.error && !routes.data ? (
              <ProblemPanel error={routes.error} scope="ops" console={caps.consoleDeclared} meta="GET /ops/observability/routes" onRetry={() => void routes.refetch()} retrying={routes.isFetching} />
            ) : (
              <Table<RouteTraffic>
                rows={list}
                rowKey={routeKey}
                loading={routes.isPending}
                sort={sort}
                onSort={onSort}
                dense
                columns={[
                  {
                    key: "route",
                    header: "Route",
                    sortValue: routeKey,
                    cell: (r) => (
                      <span className="flex items-center gap-2">
                        <Method m={r.method} />
                        {r.route && r.route !== "_overflow" ? (
                          <Link href={`/routes?route=${encodeURIComponent(`${r.method} ${r.route}`)}`} className="font-mono text-text hover:underline">
                            {r.route}
                          </Link>
                        ) : (
                          <span className="font-mono text-dim">{routeLabel(r).replace(`${r.method} `, "")}</span>
                        )}
                      </span>
                    ),
                  },
                  { key: "requests", header: "Requests", width: "110px", align: "right", sortValue: (r) => r.requests, cell: (r) => <span className="font-mono text-text tnum">{count(r.requests)}</span> },
                  { key: "rate", header: "Rate", width: "90px", align: "right", sortValue: (r) => r.requests_per_minute, cell: (r) => <span className="font-mono text-dim tnum">{rate(r.requests_per_minute)}</span> },
                  { key: "4xx", header: "4xx", width: "70px", align: "right", sortValue: (r) => r.client_errors, cell: (r) => <span className="font-mono text-dim tnum">{count(r.client_errors)}</span> },
                  { key: "5xx", header: "5xx", width: "70px", align: "right", sortValue: (r) => r.server_errors, cell: (r) => <span className={`font-mono tnum ${r.server_errors > 0 ? "text-danger" : "text-dim"}`}>{count(r.server_errors)}</span> },
                  { key: "error_rate", header: "Error rate", width: "100px", align: "right", sortValue: (r) => r.error_rate, cell: (r) => <Badge tone={r.server_errors === 0 ? "muted" : gradeTone[errorRateGrade(r.error_rate)]}>{percent(r.error_rate, 2)}</Badge> },
                  { key: "p50", header: "p50", width: "90px", align: "right", sortValue: (r) => r.latency_ms.p50, cell: (r) => <span className="font-mono text-dim tnum">{millis(r.latency_ms.p50)}</span> },
                  { key: "p95", header: "p95", width: "90px", align: "right", sortValue: (r) => r.latency_ms.p95, cell: (r) => <span className="font-mono text-text tnum">{millis(r.latency_ms.p95)}</span> },
                  { key: "p99", header: "p99", width: "90px", align: "right", sortValue: (r) => r.latency_ms.p99, cell: (r) => <span className="font-mono text-dim tnum">{millis(r.latency_ms.p99)}</span> },
                  { key: "max", header: "Max", width: "90px", align: "right", sortValue: (r) => r.latency_ms.max, cell: (r) => <span className="font-mono text-dim tnum">{millis(r.latency_ms.max)}</span> },
                ]}
                empty={<Empty title="No routes in this range" hint="Every route pattern the app answered appears here; requests no route matched count under /." />}
              />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

function TopRoutes({ title, meta, icon, rows, value, sub, loading, empty }: { title: string; meta: string; icon: React.ReactNode; rows: RouteTraffic[]; value: (r: RouteTraffic) => string; sub: (r: RouteTraffic) => string; loading: boolean; empty: string }) {
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {icon} {title}
        </span>
      }
      meta={meta}
      flush
    >
      {loading ? (
        <SkeletonLines lines={5} className="p-4" />
      ) : rows.length === 0 ? (
        <p className="px-4 pb-4 text-[12px] text-dim">{empty}</p>
      ) : (
        <ol className="stagger">
          {rows.map((r, i) => (
            <li key={routeKey(r)} className="flex items-center gap-3 border-t border-hairline px-4 py-2 text-[12px] first:border-0">
              <span className="w-4 font-mono text-[11px] text-faint tnum">{i + 1}</span>
              <Method m={r.method} />
              <span className="min-w-0 flex-1 truncate font-mono text-text">{r.route || routeLabel(r).replace(`${r.method} `, "")}</span>
              <span className="font-mono text-[11px] text-dim tnum">{sub(r)}</span>
              <span className="w-[70px] text-right font-mono font-semibold text-text tnum">{value(r)}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
