import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { Panel, Legend } from "@gorbital/dash/components/panel";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { theme } from "@gorbital/dash/theme";
import { bootstrap, bootstrapTotal } from "@/lib/mock";
import { RotateCw } from "lucide-react";

const colors: Record<string, string> = { infra: theme.muted, module: theme.info, app: theme.primary };

export default function Bootstrap() {
  const slowest = [...bootstrap].sort((a, b) => b.ms - a.ms).slice(0, 3);
  return (
    <>
      <PageHeader product="devtools" title="Bootstrap" searchHint="Jump to route, module, setting">
        <Badge tone="muted">last start 2 min ago · orb dev</Badge>
        <Button size="sm" kind="ghost" icon={<RotateCw size={11} />}>
          Restart and measure
        </Button>
      </PageHeader>
      <Page>
        <TileGrid>
          <Tile label="Time to listen" value={bootstrapTotal.toFixed(0)} unit="ms" delta="−28 ms vs last" hero />
          <Tile label="Slowest" value="postgres.Connect" unit="149 ms" delta="TLS handshake" deltaTone="flat" />
          <Tile label="Modules" value="10" unit="constructed" delta="in dependency order" deltaTone="flat" />
          <Tile label="Go" value="1.25.1" unit="darwin/arm64" delta="build 0.9 s" deltaTone="flat" />
        </TileGrid>
        <Panel
          title="Startup timeline"
          meta="one bar per constructor, in start order"
          actions={<Legend items={[{ label: "infrastructure", color: theme.muted }, { label: "modules", color: theme.info }, { label: "app", color: theme.primary }]} />}
        >
          <div className="font-mono text-[11px]">
            <div className="mb-1 grid grid-cols-[220px_1fr_70px] items-center border-b border-hairline pb-1.5 text-[10px] uppercase tracking-wider text-dim">
              <span>Constructor</span>
              <span className="relative h-3">
                {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                  <span key={t} className="absolute -translate-x-1/2" style={{ left: `${t * 100}%` }}>
                    {Math.round(bootstrapTotal * t)}ms
                  </span>
                ))}
              </span>
              <span className="text-right">Took</span>
            </div>
            <ul className="stagger">
              {bootstrap.map((b) => (
                <li key={b.name} className="grid h-7 grid-cols-[220px_1fr_70px] items-center gap-2 rounded-md px-1 -mx-1 hover:bg-elevated/60">
                  <span className="truncate text-text">{b.name}</span>
                  <span className="relative h-3.5">
                    {[0.25, 0.5, 0.75].map((t) => (
                      <i key={t} className="absolute top-0 bottom-0 border-l border-hairline" style={{ left: `${t * 100}%` }} />
                    ))}
                    <i className="absolute top-0 h-3.5 rounded-sm" style={{ left: `${(b.start / bootstrapTotal) * 100}%`, width: `${Math.max(0.3, (b.ms / bootstrapTotal) * 100)}%`, background: colors[b.kind] }} />
                  </span>
                  <span className={`text-right tnum ${b.ms > 90 ? "text-warn" : "text-dim"}`}>{b.ms.toFixed(1)} ms</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
        <div className="grid grid-cols-3 gap-3">
          {slowest.map((s, i) => (
            <div key={s.name} className="panel p-4">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-dim">
                #{i + 1} slowest
                <Badge tone="muted" className="ml-auto">
                  {s.kind}
                </Badge>
              </div>
              <div className="mt-2 font-mono text-[13px] text-text">{s.name}</div>
              <div className="mt-1 text-[22px] font-semibold tracking-tight tnum">{s.ms.toFixed(0)} <span className="text-[12px] font-normal text-dim">ms</span></div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                {i === 0 && "Pool warm-up opens 4 connections with TLS. Set POSTGRES_MIN_CONNS=1 on the bench to start faster."}
                {i === 1 && "River migrates its own tables on first client. Cached after the first run; 12 ms since."}
                {i === 2 && "Connects to SMTP at start to fail early. Set MAIL_LAZY=true to defer it."}
              </p>
            </div>
          ))}
        </div>
      </Page>
    </>
  );
}
