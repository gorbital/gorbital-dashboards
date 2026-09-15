import { Play, RefreshCw, AlertTriangle } from "lucide-react";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { Panel } from "@gorbital/dash/components/panel";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Bar } from "@gorbital/dash/components/progress";
import { theme } from "@gorbital/dash/theme";
import { fmtAgo, fmtInt } from "@gorbital/dash/lib/format";
import { migrations, pending, tables, slowQueries, NOW } from "@/lib/mock";

export default function DatabasePage() {
  const maxRows = Math.max(...tables.map((t) => t.rows));
  return (
    <>
      <PageHeader product="devtools" title="Database" searchHint="Jump to route, module, setting">
        <Badge tone="muted">postgres 17.2 · acme_api_dev · localhost:5432</Badge>
        <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />}>
          Reset seed data
        </Button>
      </PageHeader>
      <Page>
        <TileGrid>
          <Tile label="Migrations" value="12" unit="applied" delta="1 pending" deltaTone="bad" hero />
          <Tile label="Tables" value={String(tables.length)} delta="16.6 MB" deltaTone="flat" />
          <Tile label="Pool" value="3" unit="of 10 conns" delta="0 waiting" deltaTone="flat" />
          <Tile label="Seed" value="2h" unit="ago" delta="orb seed" deltaTone="flat" />
        </TileGrid>
        <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-3">
          <div className="flex flex-col gap-3">
            <Panel
              title="Migrations"
              meta="cmd/migrate"
              actions={
                <Button size="sm" kind="primary" icon={<Play size={11} />}>
                  Apply 0013
                </Button>
              }
              flush
            >
              <ul className="stagger">
                {pending.map((p) => (
                  <li key={p.v} className="flex items-center gap-3 border-b border-hairline bg-warn/5 px-4 py-2.5">
                    <AlertTriangle size={13} className="text-warn" />
                    <span className="font-mono text-[12px] text-text">
                      {p.v}_{p.name}
                    </span>
                    <Badge tone="warn">pending</Badge>
                    <span className="ml-auto font-mono text-[11px] text-dim">{p.file}</span>
                  </li>
                ))}
                {migrations.map((m) => (
                  <li key={m.v} className="flex items-center gap-3 border-t border-hairline px-4 py-2.5 first:border-0">
                    <Dot tone="ok" />
                    <span className="font-mono text-[12px] text-text">
                      {m.v}_{m.name}
                    </span>
                    <Badge tone="muted">{m.by}</Badge>
                    <span className="ml-auto font-mono text-[11px] text-dim tnum">{m.ms} ms</span>
                    <span className="w-16 text-right text-[11px] text-dim">{fmtAgo(m.applied, NOW)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Slow queries" meta="from this process, over 20 ms" flush>
              <ul className="stagger">
                {slowQueries.map((q) => (
                  <li key={q.sql} className="border-t border-hairline px-4 py-3 first:border-0">
                    <div className="flex items-center gap-3">
                      <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-text">{q.sql}</code>
                      <span className={`font-mono text-[12px] tnum ${q.ms > 100 ? "text-warn" : "text-muted"}`}>{q.ms} ms</span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 font-mono text-[10.5px] text-dim">
                      <span>{q.calls} calls</span>
                      <span>{q.route}</span>
                      <Badge tone="warn" className="ml-auto">
                        {q.hint}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
          <Panel title="Tables" meta="rows and size" flush>
            <ul className="stagger">
              {tables.map((t) => (
                <li key={t.name} className="grid grid-cols-[minmax(0,1fr)_70px_60px] items-center gap-3 border-t border-hairline px-4 py-2.5 first:border-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-mono text-[12px] text-text">
                      {t.name}
                      {t.seed && <Badge tone="accent">seed</Badge>}
                    </div>
                    <div className="mt-1.5">
                      <Bar value={Math.log10(t.rows + 1)} max={Math.log10(maxRows + 1)} color={theme.border2} height={3} />
                    </div>
                  </div>
                  <span className="text-right font-mono text-[11px] text-muted tnum">{fmtInt(t.rows)}</span>
                  <span className="text-right font-mono text-[11px] text-dim tnum">{t.size}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </Page>
    </>
  );
}
