import Link from "next/link";
import { ArrowUpRight, Clock } from "lucide-react";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Pill } from "@gorbital/dash/components/pill";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { Panel, Legend } from "@gorbital/dash/components/panel";
import { Badge, Dot, Method } from "@gorbital/dash/components/badge";
import { Bar } from "@gorbital/dash/components/progress";
import { BarChart } from "@gorbital/dash/charts/bars";
import { AreaChart } from "@gorbital/dash/charts/area";
import { Donut } from "@gorbital/dash/charts/donut";
import { Sparkline } from "@gorbital/dash/charts/sparkline";
import { theme } from "@gorbital/dash/theme";
import { fmtInt, fmtAgo, fmtMs, fmtDuration } from "@gorbital/dash/lib/format";
import { hours, perHour, totals, p95, p50, errRate, slowest, errorGroups, queues, instances, NOW } from "@/lib/mock";

export default function Overview() {
  const okPct = (totals.ok / totals.requests) * 100;
  return (
    <>
      <PageHeader product="observe" title="Overview" searchHint="Search path, request ID, org">
        <Pill dot="ok">Last 24 hours</Pill>
        <Pill>All instances</Pill>
      </PageHeader>
      <Page>
        <TileGrid>
          <Tile label="Requests" value={fmtInt(totals.requests)} delta="+4.2%" spark={perHour.ok} hero />
          <Tile label="p95 latency" value={fmtMs(p95[23])} delta="−3 ms" spark={p95} />
          <Tile label="Error rate" value={errRate[23].toFixed(2)} unit="%" delta="+0.08" deltaTone="bad" spark={errRate} sparkColor={theme.danger} />
          <Tile label="Instances" value={String(instances.length)} unit="healthy" delta="v0.5.0" deltaTone="flat" footer={<span className="flex items-center gap-1.5"><Dot tone="ok" pulse /> leader {instances[0].id} · {fmtDuration((NOW - instances[0].started) / 1000)} up</span>} />
        </TileGrid>

        <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-3">
          <Panel
            title="Requests per hour"
            meta="UTC"
            actions={<Legend items={[{ label: "2xx", color: theme.primary }, { label: "3xx", color: theme.muted }, { label: "4xx", color: theme.warn }, { label: "5xx", color: theme.danger }]} />}
          >
            <BarChart
              height={230}
              labels={hours}
              stacks={[
                { name: "2xx", data: perHour.ok, color: theme.primary },
                { name: "3xx", data: perHour.redirect, color: theme.muted },
                { name: "4xx", data: perHour.client, color: theme.warn },
                { name: "5xx", data: perHour.server, color: theme.danger },
              ]}
            />
          </Panel>
          <div className="flex flex-col gap-3">
            <Panel title="Status codes">
              <div className="grid grid-cols-[120px_1fr] items-center gap-4">
                <Donut
                  slices={[
                    { label: "2xx", value: totals.ok, color: theme.primary },
                    { label: "3xx", value: totals.redirect, color: theme.muted },
                    { label: "4xx", value: totals.client, color: theme.warn },
                    { label: "5xx", value: totals.server, color: theme.danger },
                  ]}
                  center={{ value: `${okPct.toFixed(1)}%`, label: "2xx" }}
                />
                <ul className="grid gap-1.5 text-[12px]">
                  {[
                    ["2xx", totals.ok, theme.primary],
                    ["3xx", totals.redirect, theme.muted],
                    ["4xx", totals.client, theme.warn],
                    ["5xx", totals.server, theme.danger],
                  ].map(([l, v, c]) => (
                    <li key={l as string} className="flex items-center gap-2">
                      <i className="h-2 w-2 rounded-[2px]" style={{ background: c as string }} />
                      {l}
                      <span className="ml-auto font-mono text-[11px] text-dim tnum">{fmtInt(v as number)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
            <Panel title="Slowest routes" meta="p95" className="flex-1">
              <ul className="grid gap-2.5">
                {slowest.map((s) => (
                  <li key={s.route} className="grid gap-1">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="truncate font-mono text-text">{s.route}</span>
                      <span className="font-mono text-[11px] text-dim tnum">{s.p95} ms</span>
                    </div>
                    <Bar value={s.p95} max={340} color={s.p95 > 200 ? theme.warn : theme.muted} height={4} />
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Panel title="Latency" meta="p50 / p95" actions={<Legend items={[{ label: "p95", color: theme.primary }, { label: "p50", color: theme.muted }]} />}>
            <AreaChart
              height={170}
              width={420}
              labels={hours}
              unit="ms"
              threshold={{ value: 80, label: "SLO 80ms" }}
              series={[
                { name: "p95", data: p95, color: theme.primary },
                { name: "p50", data: p50, color: theme.muted },
              ]}
            />
          </Panel>
          <Panel
            title="Errors"
            meta="grouped by cause"
            actions={
              <Link href="/errors" className="flex items-center gap-0.5 text-[11px] text-dim hover:text-text">
                All <ArrowUpRight size={12} />
              </Link>
            }
            flush
          >
            <ul className="stagger">
              {errorGroups.slice(0, 4).map((e) => (
                <li key={e.id} className="flex items-center gap-3 border-t border-hairline px-4 py-2.5 first:border-0">
                  <Dot tone={e.status === "resolved" ? "ok" : e.status === "ignored" ? "muted" : e.status === "regressed" ? "warn" : "danger"} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] text-text">{e.title}</div>
                    <div className="truncate font-mono text-[10.5px] text-dim">
                      {e.kind} · {fmtAgo(e.last, NOW)}
                    </div>
                  </div>
                  <Sparkline data={e.trend} width={64} height={20} color={theme.danger} fill={false} />
                  <span className="w-8 text-right font-mono text-[11px] text-muted tnum">{e.count}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel
            title="Queues"
            meta="River"
            actions={
              <Link href="/jobs" className="flex items-center gap-0.5 text-[11px] text-dim hover:text-text">
                Jobs <ArrowUpRight size={12} />
              </Link>
            }
          >
            <ul className="grid gap-3">
              {queues.map((q) => (
                <li key={q.name} className="grid grid-cols-[72px_1fr_auto] items-center gap-3 text-[12px]">
                  <span className="font-mono text-text">{q.name}</span>
                  <Sparkline data={q.series} width={140} height={22} color={theme.muted} />
                  <span className="text-right">
                    <b className="font-mono text-[12px] tnum">{q.depth}</b> <span className="text-dim">queued</span>
                    <span className="ml-2 font-mono text-[11px] text-dim tnum">{q.rate}/min</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center gap-2 border-t border-hairline pt-3 text-[11px] text-dim">
              <Clock size={12} /> next scheduled <span className="font-mono text-muted">audit.rollup</span> in 6 min
              <Badge tone="accent" className="ml-auto">
                leader {instances[0].id}
              </Badge>
            </div>
          </Panel>
        </div>

        <Panel title="Live" meta="last 30 seconds" flush>
          <ul className="stagger">
            {[
              { m: "GET", p: "/v1/orgs/acme/projects", s: 200, ms: 38.2, i: "i-7f3a" },
              { m: "POST", p: "/v1/auth/sign-in", s: 201, ms: 131.6, i: "i-9c21" },
              { m: "GET", p: "/v1/me", s: 200, ms: 4.1, i: "i-b04e" },
              { m: "POST", p: "/v1/orgs/acme/invites", s: 502, ms: 64.3, i: "i-7f3a" },
              { m: "GET", p: "/healthz", s: 200, ms: 1.2, i: "i-9c21" },
            ].map((x, i) => (
              <li key={i} className="flex items-center gap-3 border-t border-hairline px-4 py-2 font-mono text-[11.5px] first:border-0">
                <Method m={x.m} />
                <span className="truncate text-text">{x.p}</span>
                <Badge tone={x.s >= 500 ? "danger" : "ok"} className="ml-auto">
                  {x.s}
                </Badge>
                <span className="w-16 text-right text-dim tnum">{x.ms} ms</span>
                <span className="w-14 text-right text-dim">{x.i}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </Page>
    </>
  );
}
