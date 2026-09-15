import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Pill } from "@gorbital/dash/components/pill";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { Panel, Legend } from "@gorbital/dash/components/panel";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { theme } from "@gorbital/dash/theme";
import { checks, uptime90 } from "@/lib/mock";

export default function Health() {
  const up = (uptime90.reduce((a, b) => a + b, 0) / uptime90.length) * 100;
  return (
    <>
      <PageHeader product="deploy" title="Health" searchHint="Search release, commit, instance">
        <Pill dot="ok">production</Pill>
        <Pill>Last 90 days</Pill>
      </PageHeader>
      <Page>
        <TileGrid>
          <Tile label="Uptime" value={up.toFixed(2)} unit="%" delta="90 days" deltaTone="flat" hero />
          <Tile label="Checks" value="5" unit="of 6 passing" delta="SMTP slow" deltaTone="bad" />
          <Tile label="Incidents" value="1" unit="90 days" delta="2 m 10 s" deltaTone="flat" />
          <Tile label="Auto rollback" value="on" unit="5xx > 2% for 60 s" delta="fired once" deltaTone="flat" />
        </TileGrid>
        <Panel title="Uptime" meta="one bar per day, production" actions={<Legend items={[{ label: "100%", color: theme.ok }, { label: "degraded", color: theme.warn }, { label: "outage", color: theme.danger }]} />}>
          <div className="flex h-10 items-end gap-[3px]">
            {uptime90.map((v, i) => (
              <i key={i} className="flex-1 rounded-[2px]" style={{ height: `${Math.max(25, v * 100)}%`, background: v === 1 ? theme.ok : v > 0.9 ? theme.warn : theme.danger, opacity: v === 1 ? 0.55 : 1 }} title={`${(v * 100).toFixed(1)}%`} />
            ))}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] text-dim">
            <span>90 days ago</span>
            <span>today</span>
          </div>
        </Panel>
        <Panel title="Checks" meta="every 15 s from two regions" flush>
          <ul className="stagger">
            {checks.map((c) => (
              <li key={c.name} className="grid grid-cols-[14px_220px_90px_1fr_auto] items-center gap-3 border-t border-hairline px-4 py-3 first:border-0">
                <Dot tone={c.status === "ok" ? "ok" : "warn"} />
                <span className="text-[12.5px] font-medium text-text">{c.name}</span>
                <span className={`font-mono text-[11px] tnum ${c.status === "ok" ? "text-dim" : "text-warn"}`}>{c.latency}</span>
                <span className="text-[12px] text-muted">{c.detail}</span>
                <Badge tone={c.status === "ok" ? "ok" : "warn"}>{c.status === "ok" ? "passing" : "slow"}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      </Page>
    </>
  );
}
