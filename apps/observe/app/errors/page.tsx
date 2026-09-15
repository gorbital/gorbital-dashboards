import Link from "next/link";
import { Check, EyeOff, RotateCcw } from "lucide-react";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Pill, Segmented } from "@gorbital/dash/components/pill";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { Panel, KeyList } from "@gorbital/dash/components/panel";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code, Cmt } from "@gorbital/dash/components/code";
import { Sparkline } from "@gorbital/dash/charts/sparkline";
import { theme } from "@gorbital/dash/theme";
import { fmtAgo, fmtInt } from "@gorbital/dash/lib/format";
import { errorGroups, errRate, NOW } from "@/lib/mock";

const toneOf = { open: "danger", regressed: "warn", resolved: "ok", ignored: "muted" } as const;

export default function Errors() {
  const sel = errorGroups[0];
  const total = errorGroups.reduce((a, e) => a + e.count, 0);
  return (
    <>
      <PageHeader product="observe" title="Errors" searchHint="Search message, kind, file">
        <Pill dot="ok">Last 24 hours</Pill>
        <Segmented options={[{ value: "open", label: "Open" }, { value: "all", label: "All" }, { value: "resolved", label: "Resolved" }]} value="open" />
      </PageHeader>
      <Page>
        <TileGrid>
          <Tile label="Events" value={fmtInt(total)} delta="+31" deltaTone="bad" spark={errRate} sparkColor={theme.danger} hero />
          <Tile label="Groups" value={String(errorGroups.length)} unit="causes" delta="1 regressed" deltaTone="bad" />
          <Tile label="Users affected" value={String(errorGroups.reduce((a, e) => a + e.users, 0))} delta="of 1,204 active" deltaTone="flat" />
          <Tile label="Mean time to resolve" value="4.1" unit="h" delta="−38 min" />
        </TileGrid>

        <div className="grid grid-cols-[minmax(0,1fr)_400px] gap-3">
          <Panel title="Error groups" meta="grouped by cause and location" flush>
            <ul className="stagger">
              {errorGroups.map((e) => (
                <li key={e.id} className={`grid grid-cols-[10px_minmax(0,1fr)_80px_56px_56px_90px] items-center gap-3 border-t border-hairline px-4 py-3 first:border-0 ${e.id === sel.id ? "bg-elevated/60" : "hover:bg-elevated/40"}`}>
                  <Dot tone={toneOf[e.status]} />
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium text-text">{e.title}</div>
                    <div className="truncate font-mono text-[10.5px] text-dim">
                      <span className="text-muted">{e.kind}</span> · {e.where}
                    </div>
                  </div>
                  <Sparkline data={e.trend} width={80} height={22} color={e.status === "resolved" ? theme.muted : theme.danger} />
                  <span className="text-right font-mono text-[12px] text-text tnum">{e.count}</span>
                  <span className="text-right font-mono text-[11px] text-dim tnum">{e.users} u</span>
                  <span className="text-right text-[11px] text-dim">{fmtAgo(e.last, NOW)}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="flex flex-col gap-3">
            <Panel
              title={<span className="flex items-center gap-2"><Badge tone={toneOf[sel.status]}>{sel.status}</Badge> {sel.kind}</span>}
              actions={
                <>
                  <Button size="sm" icon={<Check size={11} />}>Resolve</Button>
                  <Button size="sm" kind="ghost" icon={<EyeOff size={11} />}>Ignore</Button>
                </>
              }
            >
              <p className="font-mono text-[12.5px] leading-relaxed text-text">{sel.title}</p>
              <div className="mt-3">
                <KeyList
                  rows={[
                    { k: "Location", v: sel.where },
                    { k: "First seen", v: fmtAgo(sel.first, NOW) },
                    { k: "Last seen", v: fmtAgo(sel.last, NOW) },
                    { k: "Events", v: `${sel.count} in 24h` },
                    { k: "Users", v: String(sel.users) },
                    { k: "Release", v: "v0.5.0 · since 8f1c2ab" },
                  ]}
                />
              </div>
            </Panel>
            <Panel title="Latest event" meta={sel.sample.route} actions={<Link href={`/traces/${sel.sample.trace}`} className="text-[11px] text-dim hover:text-text">trace →</Link>}>
              <Code>
                {sel.sample.stack.map((line, i) => {
                  const [fn, loc] = line.split("  ");
                  return (
                    <span key={i}>
                      <span className={i === 0 ? "text-danger" : "text-text"}>{fn}</span>
                      {"\n    "}
                      <Cmt>{loc}</Cmt>
                      {"\n"}
                    </span>
                  );
                })}
              </Code>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-dim">
                <RotateCcw size={11} /> retried by <span className="font-mono">mail.send</span> · attempt 3 of 5 · next in 4 min
              </div>
            </Panel>
          </div>
        </div>
      </Page>
    </>
  );
}
