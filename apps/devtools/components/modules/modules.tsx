"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Table } from "@gorbital/dash/components/table";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { useCapabilities, useDevApp, useDevRoutes } from "@/lib/api/queries";
import type { DevFlag, DevJob, DevLibrary } from "@/lib/api/types";
import { ago } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { Gate } from "@/components/shared/gate";
import { ProblemPanel } from "@/components/shared/problem-panel";

/** Pseudo-versions such as v0.0.0-20260916175959-950a90a53dc8+dirty read better cut after the timestamp. */
function shortVersion(v: string): string {
  return v.length > 22 ? `${v.slice(0, 20)}…${v.endsWith("+dirty") ? " (dirty)" : ""}` : v;
}

export function Modules() {
  const caps = useCapabilities();
  const app = useDevApp(caps.console);
  const routes = useDevRoutes(caps.console);
  const now = useNow(10_000);
  const a = app.data;

  const routeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of routes.data?.routes ?? []) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return counts;
  }, [routes.data]);
  const settingGroups = useMemo(() => {
    const groups = new Map<string, number>();
    for (const s of a?.settings ?? []) groups.set(s.group, (groups.get(s.group) ?? 0) + 1);
    return [...groups.entries()].sort((x, y) => x[0].localeCompare(y[0]));
  }, [a]);
  const modified = a?.settings.filter((s) => s.modified).length ?? 0;

  return (
    <>
      <PageHeader product="devtools" title="Modules" description={a ? `${a.name} ${a.version}${a.commit ? ` · ${a.commit.slice(0, 7)}` : ""} · ${a.go_version} · ${a.env}` : "what the running app wired: libraries, API modules, jobs, settings, flags and permissions"}>
        {a && <Badge tone="muted">/_dev/app</Badge>}
      </PageHeader>
      <Page>
        <Gate need="console" loading={<SkeletonLines lines={8} className="p-4" />}>
          {app.error && !app.data ? (
            <ProblemPanel error={app.error} scope="dev" console={caps.consoleDeclared} meta="GET /_dev/app" onRetry={() => void app.refetch()} retrying={app.isFetching} />
          ) : (
            <>
              <TileGrid>
                <Tile label="Service" value={a?.name ?? "—"} unit={a ? shortVersion(a.version) : undefined} hero loading={!a} footer={a?.commit ? `commit ${a.commit.slice(0, 12)}` : "no commit recorded"} />
                <Tile label="Libraries" value={a ? String(a.libraries.length) : "—"} unit="linked" loading={!a} footer={a ? `${a.libraries.filter((l) => l.replaced).length} replaced locally` : undefined} />
                <Tile label="API modules" value={a ? String(a.modules.length) : "—"} unit="tags" loading={!a} footer={routes.data ? `${routes.data.routes.length} routes` : "joining with /_dev/routes"} />
                <Tile label="Jobs" value={a ? String(a.jobs.length) : "—"} unit="registered" loading={!a} footer={a ? `${a.jobs.filter((j) => j.schedule).length} scheduled` : undefined} />
              </TileGrid>
              <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-3">
                <div className="flex flex-col gap-3">
                  <Panel title="Libraries" meta="gorbital modules linked into the binary" flush>
                    <Table<DevLibrary>
                      rows={a?.libraries ?? []}
                      rowKey={(l) => l.path}
                      loading={!a}
                      dense
                      columns={[
                        { key: "p", header: "Module path", cell: (l) => <span className="font-mono text-text">{l.path}</span> },
                        { key: "v", header: "Version", width: "140px", cell: (l) => <span className="font-mono text-muted">{l.version}</span> },
                        { key: "r", header: "", width: "90px", cell: (l) => (l.replaced ? <Badge tone="warn">replaced</Badge> : null) },
                      ]}
                      empty={<Empty title="No gorbital libraries" hint="The app links none of gorbital.dev's modules." />}
                    />
                  </Panel>
                  <Panel title="Jobs" meta="from the registry, with what the ops API adds on the Jobs page" flush>
                    <Table<DevJob>
                      rows={a?.jobs ?? []}
                      rowKey={(j) => j.name}
                      loading={!a}
                      dense
                      columns={[
                        {
                          key: "n",
                          header: "Job",
                          cell: (j) => (
                            <span className="flex items-center gap-2 font-mono text-text">
                              <Dot tone={j.enabled ? "ok" : "muted"} />
                              <Link href={`/jobs?job=${encodeURIComponent(j.name)}`} className="hover:underline">
                                {j.name}
                              </Link>
                              {j.modified && <Badge tone="accent">modified</Badge>}
                            </span>
                          ),
                        },
                        { key: "d", header: "Description", cell: (j) => <span className="text-muted">{j.description}</span> },
                        { key: "s", header: "Schedule", width: "140px", cell: (j) => <span className="font-mono text-dim">{j.schedule || "on demand"}</span> },
                        { key: "x", header: "Next run", width: "100px", align: "right", cell: (j) => <span className="font-mono text-dim tnum">{ago(j.next_run_at, now)}</span> },
                      ]}
                      empty={<Empty title="No jobs" hint="Minimal apps have no job registry; the Full preset brings River." />}
                    />
                  </Panel>
                  <Panel title="Feature flags" meta={a ? `${a.flags.length} declared` : undefined} flush>
                    <Table<DevFlag>
                      rows={a?.flags ?? []}
                      rowKey={(f) => f.key}
                      loading={!a}
                      dense
                      columns={[
                        {
                          key: "k",
                          header: "Flag",
                          cell: (f) => (
                            <span className="flex items-center gap-2 font-mono text-text">
                              <Dot tone={f.enabled ? "ok" : "muted"} />
                              {f.key}
                              {f.client && <Badge tone="info">client</Badge>}
                              {f.modified && <Badge tone="accent">modified</Badge>}
                            </span>
                          ),
                        },
                        { key: "d", header: "Description", cell: (f) => <span className="text-muted">{f.description}</span> },
                        { key: "r", header: "Rollout", width: "110px", cell: (f) => <span className="font-mono text-dim">{f.percentage === null ? (f.enabled ? "everyone" : "off") : `${f.percentage}%`}</span> },
                        { key: "t", header: "Targets", width: "80px", align: "right", cell: (f) => <span className="font-mono text-dim tnum">{f.targets}</span> },
                      ]}
                      empty={<Empty title="No feature flags" hint="The app declares none." />}
                    />
                  </Panel>
                </div>
                <div className="flex flex-col gap-3">
                  <Panel title="Build" meta="as the process reports it">
                    {a ? (
                      <KeyList
                        rows={[
                          { k: "Name", v: a.name },
                          { k: "Version", v: a.version },
                          { k: "Commit", v: a.commit ?? "—" },
                          { k: "Go", v: a.go_version },
                          { k: "APP_ENV", v: a.env },
                        ]}
                      />
                    ) : (
                      <SkeletonLines lines={5} />
                    )}
                  </Panel>
                  <Panel title="API modules" meta="OpenAPI tags · routes" flush>
                    {!a ? (
                      <SkeletonLines lines={4} className="p-4" />
                    ) : a.modules.length === 0 ? (
                      <Empty title="No tags" hint="The OpenAPI document declares no tags." />
                    ) : (
                      <ul>
                        {a.modules.map((m) => (
                          <li key={m}>
                            <Link href={`/routes`} className="flex items-center gap-2 border-t border-hairline px-4 py-2 text-[12px] first:border-0 hover:bg-elevated/40">
                              <span className="font-mono text-text">{m}</span>
                              <span className="ml-auto font-mono text-[11px] text-dim tnum">{routeCounts.get(m) ?? 0} routes</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                  <Panel title="Settings" meta={a ? `${a.settings.length} declared · ${modified} modified` : undefined}>
                    {!a ? (
                      <SkeletonLines lines={3} />
                    ) : settingGroups.length === 0 ? (
                      <span className="text-[12px] text-dim">This app declares no runtime settings.</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {settingGroups.map(([g, n]) => (
                          <Link key={g} href={`/settings?group=${encodeURIComponent(g)}`}>
                            <Badge tone="muted">
                              {g} <span className="text-dim">{n}</span>
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    )}
                  </Panel>
                  <Panel title="Permissions" meta={a ? `${a.permissions.length} catalog${a.permissions.length === 1 ? "" : "s"}` : undefined} flush>
                    {!a ? (
                      <SkeletonLines lines={4} className="p-4" />
                    ) : a.permissions.length === 0 ? (
                      <Empty title="No permission catalogs" hint="The app has no authentication module." />
                    ) : (
                      <ul>
                        {a.permissions.map((c) => (
                          <li key={c.name} className="border-t border-hairline px-4 py-3 first:border-0">
                            <div className="flex items-center gap-2 text-[12px]">
                              <span className="font-mono text-text">{c.name}</span>
                              <span className="ml-auto font-mono text-[11px] text-dim">{c.permissions.length} permissions · {c.roles.length} roles</span>
                            </div>
                            <ul className="mt-2 grid gap-1.5">
                              {c.roles.map((r) => (
                                <li key={r.name} className="text-[11.5px]">
                                  <span className="font-mono text-primary">{r.name}</span>
                                  <span className="text-dim"> · {r.description}</span>
                                  <div className="mt-0.5 flex flex-wrap gap-1">
                                    {r.permissions.map((p) => (
                                      <Badge key={p} tone="muted">
                                        {p}
                                      </Badge>
                                    ))}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                </div>
              </div>
            </>
          )}
        </Gate>
      </Page>
    </>
  );
}
