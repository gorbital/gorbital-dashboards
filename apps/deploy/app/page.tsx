import Link from "next/link";
import { ArrowUpRight, GitCommitHorizontal, Rocket, Undo2 } from "lucide-react";
import { Page, PageHeader } from "@apistock/dash/components/page";
import { Pill } from "@apistock/dash/components/pill";
import { Tile, TileGrid } from "@apistock/dash/components/tile";
import { Panel, Legend } from "@apistock/dash/components/panel";
import { Badge, Dot } from "@apistock/dash/components/badge";
import { Button } from "@apistock/dash/components/button";
import { Bar } from "@apistock/dash/components/progress";
import { BarChart } from "@apistock/dash/charts/bars";
import { Sparkline } from "@apistock/dash/charts/sparkline";
import { theme } from "@apistock/dash/theme";
import { fmtAgo, fmtDuration } from "@apistock/dash/lib/format";
import { envs, releases, pipeline, days, perDay, leadTime, NOW } from "@/lib/mock";
import { StatusBadge } from "@/components/status";

export default function Overview() {
  const rolling = releases[0];
  const done = pipeline.filter((s) => s.status === "done").length;
  const okCount = perDay.ok.reduce((a, b) => a + b, 0);
  const failCount = perDay.failed.reduce((a, b) => a + b, 0);
  return (
    <>
      <PageHeader product="deploy" title="Overview" searchHint="Search release, commit, instance">
        <Pill dot="ok">Last 30 days</Pill>
        <Pill>All environments</Pill>
        <Button kind="primary" size="sm" icon={<Rocket size={12} />} className="ml-2">
          Deploy
        </Button>
      </PageHeader>
      <Page>
        <div className="panel accent-wash grid grid-cols-[minmax(0,1fr)_380px] gap-6 p-5">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Dot tone="accent" pulse />
              <span className="font-mono text-[11px] uppercase tracking-wider text-dim">Rolling out now</span>
              <StatusBadge status={rolling.status} />
              <span className="ml-auto text-[11px] text-dim">started {fmtAgo(rolling.started, NOW)}</span>
            </div>
            <div className="flex items-baseline gap-3">
              <b className="text-[30px] font-semibold leading-none tracking-[-0.03em]">{rolling.version}</b>
              <span className="font-mono text-[13px] text-muted">
                <GitCommitHorizontal size={13} className="mr-1 inline" />
                {rolling.commit}
              </span>
              <span className="text-[13px] text-muted">→ production</span>
            </div>
            <p className="text-[13px] text-muted">
              {rolling.message} · <span className="text-text">{rolling.author}</span>
            </p>
            <ol className="mt-1 flex items-center gap-2">
              {pipeline.map((s, i) => (
                <li key={s.name} className="flex flex-1 items-center gap-2">
                  <div className={`flex h-9 flex-1 items-center gap-2 rounded-lg border px-3 text-[12px] ${s.status === "done" ? "border-ok/30 bg-ok/8 text-ok" : s.status === "running" ? "border-primary/40 bg-primary/10 text-text" : "border-hairline bg-elevated/40 text-dim"}`}>
                    <span className="font-mono text-[10px]">{i + 1}</span>
                    <span className="font-medium">{s.name}</span>
                    <span className="ml-auto font-mono text-[10.5px] opacity-80">{s.status === "done" ? fmtDuration(s.took ?? 0) : s.status === "running" ? "1 of 3" : "—"}</span>
                  </div>
                </li>
              ))}
            </ol>
            <div className="flex items-center gap-3">
              <Bar value={done + 0.4} max={pipeline.length} color={theme.primary} height={5} />
              <span className="shrink-0 font-mono text-[11px] text-dim tnum">i-9c21 starting · 2 m 12 s elapsed</span>
              <Link href={`/releases/${rolling.id}`} className="shrink-0">
                <Button size="sm">Follow</Button>
              </Link>
              <Button size="sm" kind="danger" icon={<Undo2 size={11} />}>
                Roll back
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 self-center">
            {envs.map((e) => (
              <Link key={e.id} href="/environments" className="flex items-center gap-3 rounded-lg border border-hairline bg-bg/40 px-3 py-2.5 hover:border-border-2">
                <Dot tone={e.status === "healthy" ? "ok" : e.status === "rolling" ? "accent" : e.status === "degraded" ? "danger" : "muted"} pulse={e.status === "rolling"} />
                <span className="w-[120px] truncate text-[12.5px] font-medium">{e.name}</span>
                <span className="font-mono text-[12px] text-text">{e.version}</span>
                <span className="font-mono text-[11px] text-dim">{e.commit}</span>
                <span className="ml-auto font-mono text-[11px] text-dim tnum">
                  {e.instances} inst · {e.rps} rps
                </span>
              </Link>
            ))}
          </div>
        </div>

        <TileGrid>
          <Tile label="Deploys" value={String(okCount + failCount)} unit="30 days" delta={`${failCount} failed`} deltaTone={failCount ? "bad" : "good"} spark={perDay.ok} />
          <Tile label="Success rate" value={((okCount / (okCount + failCount)) * 100).toFixed(1)} unit="%" delta="+1.4" />
          <Tile label="Lead time" value={leadTime[29].toFixed(1)} unit="h commit → prod" delta="−0.6 h" spark={leadTime} />
          <Tile label="Rollbacks" value="1" unit="30 days" delta="auto, in 48 s" deltaTone="flat" />
        </TileGrid>

        <div className="grid grid-cols-[minmax(0,1fr)_420px] gap-3">
          <Panel title="Deploys per day" meta="all environments" actions={<Legend items={[{ label: "succeeded", color: theme.primary }, { label: "failed", color: theme.danger }]} />}>
            <BarChart
              height={200}
              yTicks={2}
              labels={days}
              stacks={[
                { name: "ok", data: perDay.ok, color: theme.primary },
                { name: "failed", data: perDay.failed, color: theme.danger },
              ]}
            />
          </Panel>
          <Panel
            title="Recent releases"
            flush
            actions={
              <Link href="/releases" className="flex items-center gap-0.5 text-[11px] text-dim hover:text-text">
                All <ArrowUpRight size={12} />
              </Link>
            }
          >
            <ul className="stagger">
              {releases.slice(0, 6).map((x) => (
                <li key={x.id} className="flex items-center gap-3 border-t border-hairline px-4 py-2.5 first:border-0">
                  <StatusBadge status={x.status} />
                  <Link href={`/releases/${x.id}`} className="font-mono text-[12px] text-text hover:text-primary">
                    {x.version}
                  </Link>
                  <span className="font-mono text-[11px] text-dim">{x.commit}</span>
                  <span className="text-[11px] text-muted">{x.env}</span>
                  <span className="ml-auto text-[11px] text-dim">{fmtAgo(x.started, NOW)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <Panel title="Lead time" meta="hours from commit to running in production, per deploy">
          <Sparkline data={leadTime} width={1100} height={60} color={theme.muted} className="h-[60px] w-full" />
        </Panel>
      </Page>
    </>
  );
}
