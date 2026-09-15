import { Pause, ArrowDownToLine } from "lucide-react";
import { Page, PageHeader } from "@apistock/dash/components/page";
import { Pill, Segmented } from "@apistock/dash/components/pill";
import { Panel } from "@apistock/dash/components/panel";
import { Button } from "@apistock/dash/components/button";
import { Badge } from "@apistock/dash/components/badge";
import { BarChart } from "@apistock/dash/charts/bars";
import { theme } from "@apistock/dash/theme";
import { fmtTime } from "@apistock/dash/lib/format";
import { logs, hours, perHour } from "@/lib/mock";

const levelClass = { debug: "text-faint", info: "text-info", warn: "text-warn", error: "text-danger" } as const;

export default function Logs() {
  return (
    <>
      <PageHeader product="observe" title="Logs" searchHint='level:error route:"POST /v1/orgs/*"'>
        <Pill dot="ok">Live</Pill>
        <Segmented options={[{ value: "all", label: "All" }, { value: "info", label: "Info+" }, { value: "warn", label: "Warn+" }, { value: "error", label: "Error" }]} value="all" />
        <Pill>All instances</Pill>
      </PageHeader>
      <Page>
        <Panel title="Volume" meta="lines per hour" className="shrink-0">
          <BarChart
            height={90}
            yTicks={2}
            labels={hours}
            stacks={[
              { name: "info", data: perHour.ok.map((v) => v * 1.4), color: theme.border2 },
              { name: "warn", data: perHour.client, color: theme.warn },
              { name: "error", data: perHour.server, color: theme.danger },
            ]}
          />
        </Panel>
        <Panel
          title="Stream"
          meta="structured · slog"
          flush
          actions={
            <>
              <Badge tone="ok">tailing</Badge>
              <Button size="sm" kind="ghost" icon={<Pause size={11} />}>Pause</Button>
              <Button size="sm" kind="ghost" icon={<ArrowDownToLine size={11} />}>Export</Button>
            </>
          }
        >
          <div className="border-t border-hairline bg-code-bg font-mono text-[11.5px] leading-[1.7]">
            {logs.map((l, i) => (
              <div key={i} className="flex gap-3 border-b border-hairline/60 px-4 py-1 hover:bg-elevated/40">
                <span className="shrink-0 text-dim tnum">{fmtTime(l.at)}</span>
                <span className={`w-12 shrink-0 uppercase ${levelClass[l.level]}`}>{l.level}</span>
                <span className="w-14 shrink-0 text-faint">{l.instance}</span>
                <span className="shrink-0 text-text">{l.msg}</span>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {Object.entries(l.fields).map(([k, v]) => (
                    <span key={k} className="mr-3">
                      <span className="text-primary/80">{k}</span>=<span className={k === "err" ? "text-danger" : "text-muted"}>{v.includes(" ") ? `"${v}"` : v}</span>
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </Page>
    </>
  );
}
