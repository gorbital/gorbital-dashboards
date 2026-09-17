"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, Boxes, ExternalLink, FolderGit2, Play, RotateCw, Square, Terminal } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { ConfirmDialog } from "@gorbital/dash/components/dialog";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Skeleton, SkeletonLines } from "@gorbital/dash/components/spinner";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { fmtDuration } from "@gorbital/dash/lib/format";
import type { Tone } from "@gorbital/dash/theme";
import { useAppAction, useCapabilities, useDevApp, useDevMigrations, useReadiness, useStatus, useSystem } from "@/lib/api/queries";
import { describeError } from "@/lib/api/errors";
import type { AppState, LinkKey, Status } from "@/lib/api/types";
import { useNow } from "@/lib/use-now";
import { SchemaNotice } from "@/components/database/schema-notice";
import { ConnectionProblem } from "./connection";
import { OutputConsole } from "./output-console";

const stateTone: Record<AppState, Tone> = { running: "ok", building: "warn", preparing: "warn", stopped: "danger" };
const linkLabels: Record<LinkKey, string> = { api: "API", docs: "API docs", mail: "Mail", console: "Dev console", grafana: "Grafana" };

export function Overview() {
  const status = useStatus();
  const app = status.data?.app;
  const running = app?.state === "running";
  const readiness = useReadiness(running);
  const devApp = useDevApp(Boolean(running && app?.console));
  const caps = useCapabilities();
  const system = useSystem(caps.ops);
  const migrations = useDevMigrations(caps.console && caps.database);
  const pending = migrations.data?.pending ?? system.data?.database.migrations.pending ?? 0;
  const restart = useAppAction("restart");
  const stop = useAppAction("stop");
  const start = useAppAction("start");
  const [stopOpen, setStopOpen] = useState(false);
  const now = useNow();

  const busy = restart.isPending || stop.isPending || start.isPending;
  const canRestart = Boolean(app) && app?.state !== "building" && app?.state !== "preparing";
  const uptime = app?.started_at && now ? fmtDuration(Math.max(0, now - Date.parse(app.started_at)) / 1000) : "—";

  return (
    <>
      <PageHeader product="devtools" title="Overview" description={status.data ? `${status.data.project.name} · ${status.data.project.dir}` : "the app on your bench, as orb dev runs it"}>
        {status.data && (
          <Badge tone="muted">
            orb {status.data.portal.version} · ui {status.data.portal.ui}
          </Badge>
        )}
        <Button size="sm" kind="secondary" icon={<RotateCw size={11} />} onClick={() => restart.mutate()} disabled={!canRestart || busy} loading={restart.isPending}>
          Restart
        </Button>
        <Button size="sm" kind="danger" icon={<Square size={11} />} onClick={() => setStopOpen(true)} disabled={!running || busy} loading={stop.isPending}>
          Stop
        </Button>
        <Button size="sm" kind="primary" icon={<Play size={11} />} onClick={() => start.mutate()} disabled={app?.state !== "stopped" || busy} loading={start.isPending}>
          Start
        </Button>
      </PageHeader>
      <Page>
        {status.error && !status.data ? (
          <ConnectionProblem error={status.error} retrying={status.isFetching} onRetry={() => void status.refetch()} />
        ) : (
          <>
            <SchemaNotice />
            <TileGrid>
              <Tile
                label="App"
                value={app?.state ?? "—"}
                unit={app?.addr}
                hero
                loading={!app}
                icon={app ? <Dot tone={stateTone[app.state]} pulse={running} /> : undefined}
                footer={app?.problem ? <span className="text-danger">{app.problem}</span> : app?.pid ? `pid ${app.pid} · ${app.url}` : app ? "no process" : undefined}
              />
              <Tile label="Uptime" value={uptime} loading={!app} footer={app?.started_at ? `since ${new Date(app.started_at).toLocaleTimeString()}` : "not running"} />
              <Tile label="Restarts" value={app ? String(app.restarts) : "—"} loading={!app} footer="since orb dev started" />
              <Tile
                label="Readiness"
                value={!running ? "—" : readiness.data ? (readiness.data.ok ? "ok" : "failed") : "…"}
                unit={readiness.data ? String(readiness.data.status) : undefined}
                loading={running && readiness.isPending}
                deltaTone={readiness.data?.ok === false ? "bad" : "flat"}
                footer={
                  !running ? (
                    "app not running"
                  ) : readiness.error ? (
                    <span className="text-danger">{readiness.error.message}</span>
                  ) : pending > 0 ? (
                    <Link href="/database" className="inline-flex items-center gap-1.5 hover:underline">
                      <Badge tone="warn">{pending} pending migration{pending === 1 ? "" : "s"}</Badge>
                    </Link>
                  ) : (
                    "GET /readyz every 10 s"
                  )
                }
              />
            </TileGrid>
            <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-3">
              <OutputConsole />
              <div className="flex flex-col gap-3">
                <ProjectPanel status={status.data} />
                <LinksPanel status={status.data} />
                {caps.status.data?.project && (caps.status.data.project.features.includes("ops") || caps.status.data.project.preset === "full") && <HealthPanel running={running} consoleDeclared={caps.consoleDeclared} system={system} />}
                <Panel title="Dev console" meta="/_dev/app" flush>
                  {!app ? (
                    <SkeletonLines lines={4} className="p-4" />
                  ) : !app.console ? (
                    <Empty title="No dev console" hint="The app doesn't serve /_dev/; run it through orb dev with a DEV_CONSOLE_TOKEN." />
                  ) : !running ? (
                    <Empty title="App not running" hint="The console answers while the app is up." />
                  ) : devApp.data ? (
                    <div className="grid gap-3 p-4 pt-3">
                      <ul className="grid grid-cols-3 gap-2 text-center">
                        {[
                          ["jobs", devApp.data.jobs.length],
                          ["settings", devApp.data.settings.length],
                          ["flags", devApp.data.flags.length],
                        ].map(([k, n]) => (
                          <li key={k} className="rounded-lg border border-hairline bg-bg/40 px-2 py-2">
                            <div className="text-[18px] font-semibold leading-none tnum">{n}</div>
                            <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-dim">{k}</div>
                          </li>
                        ))}
                      </ul>
                      <KeyList
                        rows={[
                          { k: "Service", v: `${devApp.data.name} ${devApp.data.version}` },
                          { k: "Go", v: devApp.data.go_version },
                          { k: "Libraries", v: `${devApp.data.libraries.length} linked` },
                        ]}
                      />
                      <div className="flex flex-wrap gap-1">
                        {devApp.data.modules.map((m) => (
                          <Badge key={m} tone="info">
                            {m}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : devApp.error ? (
                    <p className="p-4 font-mono text-[11px] text-danger">{devApp.error.message}</p>
                  ) : (
                    <SkeletonLines lines={4} className="p-4" />
                  )}
                </Panel>
              </div>
            </div>
          </>
        )}
      </Page>
      <ConfirmDialog
        open={stopOpen}
        onOpenChange={setStopOpen}
        title="Stop the app?"
        description="orb dev ends the process and keeps it stopped until you start it here or change a file."
        confirmLabel="Stop"
        danger
        loading={stop.isPending}
        onConfirm={() => stop.mutate(undefined, { onSettled: () => setStopOpen(false) })}
      />
    </>
  );
}

function ProjectPanel({ status }: { status?: Status }) {
  const p = status?.project;
  return (
    <Panel title="Project" meta={p ? `${p.preset} preset` : undefined}>
      {!p ? (
        <SkeletonLines lines={5} />
      ) : (
        <div className="grid gap-3">
          <KeyList
            rows={[
              { k: "Name", v: p.name },
              { k: "Module", v: p.module },
              { k: "Tenancy", v: p.tenancy ?? "single" },
              { k: "Database", v: p.database ? "PostgreSQL" : "none" },
              { k: "Mail", v: p.mail ?? "—" },
              { k: "Directory", v: p.dir },
            ]}
          />
          <div className="flex flex-wrap gap-1">
            {p.features.length === 0 ? (
              <span className="text-[11px] text-dim">no features</span>
            ) : (
              p.features.map((f) => (
                <Badge key={f} tone="accent">
                  {f}
                </Badge>
              ))
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function LinksPanel({ status }: { status?: Status }) {
  const links = status ? Object.entries(status.links).filter(([, url]) => url) : [];
  return (
    <Panel title="Links" meta="on this machine" flush>
      {!status ? (
        <div className="grid gap-2 p-4 pt-3">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ) : links.length === 0 ? (
        <Empty title="No links yet" hint="orb dev adds them as services come up." />
      ) : (
        <ul className="stagger">
          {links.map(([key, url]) => (
            <li key={key}>
              <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 border-t border-hairline px-4 py-2.5 text-[12px] first:border-0 hover:bg-elevated/40">
                <span className="grid w-4 place-items-center text-dim">{key === "console" ? <Terminal size={13} /> : key === "grafana" ? <Activity size={13} /> : key === "api" || key === "docs" ? <Boxes size={13} /> : <FolderGit2 size={13} />}</span>
                <span className="text-text">{linkLabels[key as LinkKey] ?? key}</span>
                <span className="ml-auto truncate font-mono text-[11px] text-dim">{url.replace(/^https?:\/\//, "")}</span>
                <ExternalLink size={11} className="shrink-0 text-faint" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** The instance's readiness checks and migration state, from /ops/system, while the app runs. */
function HealthPanel({ running, consoleDeclared, system }: { running: boolean; consoleDeclared?: boolean; system: ReturnType<typeof useSystem> }) {
  const checks = system.data?.checks ?? [];
  const failed = checks.filter((c) => c.status !== "ok").length;
  const m = system.data?.database.migrations;
  return (
    <Panel title="Health" meta="/ops/system" actions={system.data && <Badge tone={failed > 0 || system.data.database.status !== "ok" ? "danger" : "ok"}>{failed > 0 ? `${failed} failed` : "all ok"}</Badge>} flush>
      {!running ? (
        <Empty title="App not running" hint="Checks run while the app is up." />
      ) : system.error && !system.data ? (
        <div className="p-4 text-[12px] text-muted">
          <div className="font-medium text-text">{describeError(system.error, { scope: "ops", console: consoleDeclared }).title}</div>
          <p className="mt-1">{describeError(system.error, { scope: "ops", console: consoleDeclared }).hint}</p>
        </div>
      ) : !system.data ? (
        <SkeletonLines lines={3} className="p-4" />
      ) : (
        <ul>
          {checks.map((c) => (
            <li key={c.name} className="flex items-center gap-2 border-t border-hairline px-4 py-2 text-[12px] first:border-0">
              <Dot tone={c.status === "ok" ? "ok" : "danger"} />
              <span className="font-mono text-text">{c.name}</span>
              <span className="ml-auto font-mono text-[11px] text-dim tnum">
                {c.status} · {c.duration_ms} ms
              </span>
            </li>
          ))}
          <li className="flex items-center gap-2 border-t border-hairline px-4 py-2 text-[12px]">
            <Dot tone={m && m.pending > 0 ? "warn" : "ok"} />
            <Link href="/database" className="font-mono text-text hover:underline">
              migrations
            </Link>
            <span className="ml-auto font-mono text-[11px] text-dim tnum">{m ? (m.pending > 0 ? `${m.pending} pending · ${m.current} → ${m.latest}` : `up to date · ${m.current}`) : "—"}</span>
          </li>
        </ul>
      )}
    </Panel>
  );
}
