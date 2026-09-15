import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Pill } from "@gorbital/dash/components/pill";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { Panel, KeyList } from "@gorbital/dash/components/panel";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Bar } from "@gorbital/dash/components/progress";
import { Sparkline } from "@gorbital/dash/charts/sparkline";
import { theme } from "@gorbital/dash/theme";
import { fmtDuration, fmtAgo } from "@gorbital/dash/lib/format";
import { instances, NOW } from "@/lib/mock";

export default function Instances() {
  return (
    <>
      <PageHeader product="observe" title="Instances" searchHint="Search instance, region, version">
        <Pill dot="ok">3 running</Pill>
        <Pill>v0.5.0</Pill>
      </PageHeader>
      <Page>
        <TileGrid>
          <Tile label="Running" value="3" unit="of 3" delta="all v0.5.0" deltaTone="flat" hero />
          <Tile label="Requests / s" value="182" delta="+6%" />
          <Tile label="CPU" value="37" unit="% avg" delta="peak 61%" deltaTone="flat" />
          <Tile label="Memory" value="422" unit="MB avg" delta="of 1 GB" deltaTone="flat" />
        </TileGrid>
        <div className="grid grid-cols-3 gap-3 stagger">
          {instances.map((i) => (
            <div key={i.id} className="panel flex flex-col gap-4 p-4">
              <div className="flex items-center gap-2">
                <Dot tone="ok" pulse />
                <span className="font-mono text-[14px] font-semibold">{i.id}</span>
                {i.leader && <Badge tone="accent">jobs leader</Badge>}
                <span className="ml-auto font-mono text-[11px] text-dim">{i.region}</span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-dim">cpu</div>
                  <b className="text-[22px] font-semibold leading-none tnum">{Math.round(i.cpu[29])}%</b>
                </div>
                <Sparkline data={i.cpu} width={150} height={40} color={theme.muted} />
              </div>
              <div>
                <div className="mb-1 flex justify-between font-mono text-[10px] text-dim">
                  <span>memory</span>
                  <span className="tnum">{i.mem} MB / 1024</span>
                </div>
                <Bar value={i.mem} max={1024} color={theme.muted} height={4} />
              </div>
              <KeyList
                rows={[
                  { k: "Release", v: `${i.version} · ${i.commit}` },
                  { k: "Go", v: i.go },
                  { k: "Started", v: `${fmtAgo(i.started, NOW)} · up ${fmtDuration((NOW - i.started) / 1000)}` },
                  { k: "Req/s", v: String(i.rps) },
                ]}
              />
            </div>
          ))}
        </div>
        <Panel title="Rolling deploy" meta="v0.4.2 → v0.5.0, 2 hours ago">
          <ol className="grid grid-cols-3 gap-3 text-[12px]">
            {["i-7f3a", "i-9c21", "i-b04e"].map((id, n) => (
              <li key={id} className="flex items-center gap-3 rounded-lg border border-hairline bg-elevated/40 px-3 py-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-ok/15 font-mono text-[10px] text-ok">{n + 1}</span>
                <span className="font-mono">{id}</span>
                <span className="ml-auto font-mono text-[11px] text-dim">{["14:11", "14:14", "14:18"][n]} · 41 s</span>
              </li>
            ))}
          </ol>
        </Panel>
      </Page>
    </>
  );
}
