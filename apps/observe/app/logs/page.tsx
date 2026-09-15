import { Calendar, FileText, Plus, Search } from "lucide-react";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Pill, Segmented } from "@gorbital/dash/components/pill";
import { Panel, Legend } from "@gorbital/dash/components/panel";
import { BarChart } from "@gorbital/dash/charts/bars";
import { theme } from "@gorbital/dash/theme";
import { logs, hours, perHour } from "@/lib/mock";
import { LogTable } from "@/components/log-table";

export default function Logs() {
  return (
    <>
      <PageHeader product="observe" title="Logs" description="Everything your app logged, correlated to the requests and jobs it ran in." icon={<FileText size={18} />}>
        <Pill dot="ok">acme-api</Pill>
        <span className="flex items-center gap-1">
          <Segmented options={[{ value: "1h", label: "1H" }, { value: "24h", label: "24H" }, { value: "3d", label: "3D" }, { value: "30d", label: "30D" }]} value="1h" />
          <button className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface text-dim hover:text-text" aria-label="Pick a range">
            <Calendar size={13} />
          </button>
        </span>
      </PageHeader>
      <Page>
        <div className="flex flex-wrap items-center gap-2">
          {["From", "To", "Level", "Context"].map((f) => (
            <button key={f} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-border-2 px-3 text-[12px] text-muted hover:border-primary/50 hover:text-text">
              <Plus size={12} /> {f}
            </button>
          ))}
          <label className="ml-auto flex h-8 w-[300px] items-center gap-2 rounded-lg border border-border bg-surface px-3 text-[12px] text-dim">
            <Search size={13} />
            <input className="w-full bg-transparent text-text outline-none placeholder:text-dim" placeholder='level:error ctx:mail.*' />
          </label>
        </div>
        <Panel flush>
          <div className="flex items-center gap-3 px-4 pt-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Volume · lines per hour</span>
            <span className="ml-auto">
              <Legend items={[{ label: "info", color: theme.border2 }, { label: "warn", color: theme.warn }, { label: "error", color: theme.danger }]} />
            </span>
          </div>
          <div className="px-2">
            <BarChart
              height={64}
              yTicks={1}
              labels={hours}
              stacks={[
                { name: "info", data: perHour.ok.map((v) => v * 1.4), color: theme.border2 },
                { name: "warn", data: perHour.client, color: theme.warn },
                { name: "error", data: perHour.server, color: theme.danger },
              ]}
            />
          </div>
          <LogTable rows={logs} initiallyOpen={logs[0].id} />
        </Panel>
      </Page>
    </>
  );
}
