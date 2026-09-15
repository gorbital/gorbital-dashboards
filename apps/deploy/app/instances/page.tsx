import { Page, PageHeader } from "@apistock/dash/components/page";
import { Pill } from "@apistock/dash/components/pill";
import { Tile, TileGrid } from "@apistock/dash/components/tile";
import { Panel, KeyList } from "@apistock/dash/components/panel";
import { Badge, Dot } from "@apistock/dash/components/badge";
import { Button } from "@apistock/dash/components/button";
import { Bar } from "@apistock/dash/components/progress";
import { theme } from "@apistock/dash/theme";
import { fmtAgo, fmtDuration } from "@apistock/dash/lib/format";
import { instances, NOW } from "@/lib/mock";

export default function Instances() {
  return (
    <>
      <PageHeader product="deploy" title="Instances" searchHint="Search release, commit, instance">
        <Pill dot="ok">4 running</Pill>
        <Pill>All environments</Pill>
      </PageHeader>
      <Page>
        <TileGrid>
          <Tile label="Production" value="3" unit="instances" delta="1 starting" deltaTone="flat" hero />
          <Tile label="On v0.5.1" value="2" unit="of 3" delta="rolling" deltaTone="flat" />
          <Tile label="Traffic" value="182" unit="req/s" delta="weighted 33 / 0 / 67" deltaTone="flat" />
          <Tile label="Restarts" value="0" unit="24 h" delta="0 OOM" />
        </TileGrid>
        <div className="grid grid-cols-2 gap-3 stagger">
          {instances.map((i) => (
            <div key={i.id} className={`panel p-4 ${i.health === "starting" ? "border-primary/30" : ""}`}>
              <div className="flex items-center gap-2">
                <Dot tone={i.health === "healthy" ? "ok" : i.health === "starting" ? "accent" : i.health === "draining" ? "warn" : "muted"} pulse={i.health === "starting"} />
                <span className="font-mono text-[14px] font-semibold">{i.id}</span>
                <Badge tone={i.env === "production" ? "accent" : "muted"}>{i.env}</Badge>
                <Badge tone={i.health === "healthy" ? "ok" : i.health === "starting" ? "accent" : "muted"}>{i.health}</Badge>
                <span className="ml-auto font-mono text-[11px] text-dim">{i.region}</span>
              </div>
              <div className="mt-4 grid grid-cols-[1fr_1fr] gap-4">
                <KeyList
                  rows={[
                    { k: "Release", v: `${i.version} · ${i.commit}` },
                    { k: "Size", v: i.size },
                    { k: "Started", v: `${fmtAgo(i.started, NOW)} · up ${fmtDuration((NOW - i.started) / 1000)}` },
                    { k: "Traffic", v: `${i.weight}% · ${i.rps} req/s` },
                  ]}
                />
                <div className="grid gap-3">
                  <Meter label="cpu" value={i.cpu} max={100} unit="%" warn={i.cpu > 65} />
                  <Meter label="memory" value={i.mem} max={i.size.includes("512") ? 512 : 1024} unit=" MB" warn={false} />
                  <Meter label="weight" value={i.weight} max={100} unit="%" warn={false} accent />
                </div>
              </div>
              <div className="mt-4 flex gap-1.5 border-t border-hairline pt-3">
                <Button size="sm" kind="ghost">Logs</Button>
                <Button size="sm" kind="ghost">SSH</Button>
                <Button size="sm" kind="ghost">Restart</Button>
                <Button size="sm" kind="ghost" className="ml-auto">Drain</Button>
              </div>
            </div>
          ))}
        </div>
      </Page>
    </>
  );
}

function Meter({ label, value, max, unit, warn, accent }: { label: string; value: number; max: number; unit: string; warn: boolean; accent?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex justify-between font-mono text-[10px] text-dim">
        <span>{label}</span>
        <span className={`tnum ${warn ? "text-warn" : ""}`}>
          {value}
          {unit}
        </span>
      </div>
      <Bar value={value} max={max} color={warn ? theme.warn : accent ? theme.primary : theme.border2} height={4} />
    </div>
  );
}
