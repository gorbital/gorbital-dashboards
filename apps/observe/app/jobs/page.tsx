import { Play, Pause } from "lucide-react";
import { Page, PageHeader } from "@apistock/dash/components/page";
import { Pill } from "@apistock/dash/components/pill";
import { Tile, TileGrid } from "@apistock/dash/components/tile";
import { Panel } from "@apistock/dash/components/panel";
import { Badge, Dot } from "@apistock/dash/components/badge";
import { Button } from "@apistock/dash/components/button";
import { Table } from "@apistock/dash/components/table";
import { Sparkline } from "@apistock/dash/charts/sparkline";
import { theme } from "@apistock/dash/theme";
import { fmtAgo, fmtMs, fmtInt } from "@apistock/dash/lib/format";
import { queues, jobDefs, jobRuns, NOW, type JobRun } from "@/lib/mock";

const stateTone = { succeeded: "ok", failed: "danger", running: "accent", retrying: "warn", scheduled: "muted" } as const;

export default function Jobs() {
  return (
    <>
      <PageHeader product="observe" title="Jobs" searchHint="Search job, queue, run ID">
        <Pill dot="ok">Last 24 hours</Pill>
        <Pill>All queues</Pill>
      </PageHeader>
      <Page>
        <TileGrid>
          <Tile label="Runs" value={fmtInt(3_114)} delta="+6.1%" hero spark={queues[0].series} />
          <Tile label="Failed" value="13" unit="0.42%" delta="+4" deltaTone="bad" />
          <Tile label="Queued now" value={String(queues.reduce((a, q) => a + q.depth, 0))} delta="wait p95 0.9 s" deltaTone="flat" />
          <Tile label="Workers" value="13" unit="across 3 instances" delta="leader i-7f3a" deltaTone="flat" />
        </TileGrid>

        <div className="grid grid-cols-3 gap-3 stagger">
          {queues.map((q) => (
            <div key={q.name} className="panel p-4">
              <div className="flex items-center gap-2">
                <Dot tone={q.depth > 10 ? "warn" : "ok"} pulse={q.depth > 0} />
                <span className="font-mono text-[13px] font-semibold">{q.name}</span>
                <span className="ml-auto font-mono text-[11px] text-dim">{q.workers} workers</span>
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <b className="text-[24px] font-semibold leading-none tracking-tight tnum">{q.depth}</b>
                  <span className="ml-1.5 text-[11px] text-dim">queued</span>
                </div>
                <Sparkline data={q.series} width={130} height={36} color={theme.muted} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-hairline pt-3 font-mono text-[11px] text-dim">
                <span>
                  <span className="text-text tnum">{q.rate}</span>/min
                </span>
                <span className="text-right">
                  wait p95 <span className="text-text tnum">{q.wait}s</span>
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_420px] gap-3">
          <Panel title="Runs" meta="newest first" flush>
            <Table<JobRun>
              rows={jobRuns}
              rowKey={(j) => j.id}
              columns={[
                { key: "s", header: "State", width: "96px", cell: (j) => <Badge tone={stateTone[j.state]}>{j.state}</Badge> },
                { key: "job", header: "Job", cell: (j) => <span className="font-mono text-text">{j.job}</span> },
                { key: "q", header: "Queue", width: "100px", cell: (j) => <span className="font-mono text-dim">{j.queue}</span> },
                { key: "a", header: "Attempt", width: "70px", align: "right", cell: (j) => <span className="font-mono text-dim tnum">{j.attempt}</span> },
                { key: "ms", header: "Duration", width: "90px", align: "right", cell: (j) => <span className="font-mono text-muted tnum">{j.state === "running" ? "…" : fmtMs(j.ms)}</span> },
                { key: "by", header: "Enqueued by", width: "130px", cell: (j) => <span className="font-mono text-dim">{j.by}</span> },
                { key: "at", header: "", width: "70px", align: "right", cell: (j) => <span className="text-dim">{fmtAgo(j.at, NOW)}</span> },
              ]}
            />
          </Panel>
          <Panel title="Definitions" meta="config lives in /ops/jobs" flush>
            <ul className="stagger">
              {jobDefs.map((d) => (
                <li key={d.name} className="flex items-center gap-3 border-t border-hairline px-4 py-2.5 first:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-mono text-[12px] text-text">
                      {d.name}
                      {!d.enabled && <Badge tone="muted">disabled</Badge>}
                    </div>
                    <div className="font-mono text-[10.5px] text-dim">
                      {d.schedule} · {d.queue} · p95 {fmtMs(d.p95)}
                    </div>
                  </div>
                  <span className={`font-mono text-[11px] tnum ${d.fail > 1 ? "text-danger" : "text-dim"}`}>{d.fail}% fail</span>
                  <Button size="sm" kind="ghost" icon={d.enabled ? <Pause size={11} /> : <Play size={11} />}>
                    {d.enabled ? "Pause" : "Enable"}
                  </Button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </Page>
    </>
  );
}
