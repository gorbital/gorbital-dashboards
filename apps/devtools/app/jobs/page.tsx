import { Play, History } from "lucide-react";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { Panel } from "@gorbital/dash/components/panel";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code, Cmt } from "@gorbital/dash/components/code";
import { fmtAgo, fmtMs } from "@gorbital/dash/lib/format";
import { jobDefs, jobRuns, NOW } from "@/lib/mock";

export default function Jobs() {
  return (
    <>
      <PageHeader product="devtools" title="Jobs" searchHint="Jump to route, module, setting">
        <Badge tone="muted">River · 3 queues · leader: this process</Badge>
      </PageHeader>
      <Page>
        <TileGrid>
          <Tile label="Definitions" value={String(jobDefs.length)} unit="registered" delta="internal/jobs" deltaTone="flat" hero />
          <Tile label="Queued" value="0" delta="workers idle" deltaTone="flat" />
          <Tile label="Runs today" value="61" delta="1 failed" deltaTone="bad" />
          <Tile label="Next scheduled" value="audit.rollup" unit="in 6 min" deltaTone="flat" delta="*/15 * * * *" />
        </TileGrid>
        <div className="grid grid-cols-[minmax(0,1fr)_440px] gap-3">
          <Panel title="Definitions" meta="run any job now with the args you choose" flush>
            <ul className="stagger">
              {jobDefs.map((d) => (
                <li key={d.name} className="grid grid-cols-[minmax(0,1fr)_120px_90px_100px_auto] items-center gap-3 border-t border-hairline px-4 py-3 first:border-0 hover:bg-elevated/40">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-mono text-[12.5px] text-text">
                      <Dot tone={d.lastState === "failed" ? "danger" : "ok"} />
                      {d.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-dim">
                      queue {d.queue} · timeout {d.timeout} · {d.attempts} attempts
                    </div>
                  </div>
                  <Badge tone={d.schedule === "on demand" ? "muted" : "accent"}>{d.schedule}</Badge>
                  <span className="text-[11px] text-dim">{fmtAgo(d.last, NOW)}</span>
                  <Badge tone={d.lastState === "failed" ? "danger" : "ok"}>{d.lastState}</Badge>
                  <span className="flex gap-1">
                    <Button size="sm" kind="primary" icon={<Play size={11} />}>
                      Run now
                    </Button>
                    <Button size="sm" kind="ghost" icon={<History size={11} />}>
                      Runs
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          <div className="flex flex-col gap-3">
            <Panel title="Run a job" meta="projects.reindex">
              <Code>
                <Cmt>// args, as the worker receives them</Cmt>
                {"\n{\n  "}
                <span className="text-primary">&quot;org_id&quot;</span>: <span className="text-text">&quot;org_acme&quot;</span>,{"\n  "}
                <span className="text-primary">&quot;since&quot;</span>: <span className="text-text">&quot;2026-09-01&quot;</span>
                {"\n}"}
              </Code>
              <div className="mt-3 flex items-center gap-2">
                <Button kind="primary" size="sm" icon={<Play size={11} />}>
                  Enqueue
                </Button>
                <Badge tone="warn">no timeout declared</Badge>
              </div>
            </Panel>
            <Panel title="Recent runs" meta="this process" flush>
              <ul className="stagger">
                {jobRuns.map((j) => (
                  <li key={j.id} className="border-t border-hairline px-4 py-2.5 first:border-0">
                    <div className="flex items-center gap-2 font-mono text-[12px]">
                      <Badge tone={j.state === "failed" ? "danger" : "ok"}>{j.state}</Badge>
                      <span className="text-text">{j.job}</span>
                      <span className="ml-auto text-[11px] text-dim tnum">{fmtMs(j.ms)}</span>
                      <span className="w-14 text-right text-[11px] text-dim">{fmtAgo(j.at, NOW)}</span>
                    </div>
                    <div className={`mt-1 font-mono text-[11px] ${j.state === "failed" ? "text-danger" : "text-muted"}`}>{j.out}</div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </Page>
    </>
  );
}
