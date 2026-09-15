import Link from "next/link";
import { ArrowLeft, Check, Circle, GitCommitHorizontal, Loader, Undo2, X } from "lucide-react";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Panel, KeyList } from "@gorbital/dash/components/panel";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Bar } from "@gorbital/dash/components/progress";
import { theme } from "@gorbital/dash/theme";
import { fmtAgo, fmtDuration, fmtTime } from "@gorbital/dash/lib/format";
import { releases, pipeline, rolloutLog, instances, NOW } from "@/lib/mock";
import { StatusBadge } from "@/components/status";

export function generateStaticParams() {
  return releases.map((x) => ({ id: x.id }));
}

const icon = {
  done: <Check size={12} className="text-ok" />,
  running: <Loader size={12} className="animate-spin text-primary" />,
  pending: <Circle size={10} className="text-dim" />,
  failed: <X size={12} className="text-danger" />,
};

export default async function ReleaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const x = releases.find((r) => r.id === id) ?? releases[0];
  const live = x.status === "rolling";
  const stages = live ? pipeline : pipeline.map((s) => ({ ...s, status: x.status === "failed" && s.name === "Migrate" ? ("failed" as const) : ("done" as const), steps: s.steps?.map((st) => ({ ...st, status: "done" as const, took: st.took ?? 40 })) }));
  const fleet = instances.filter((i) => i.env === x.env);
  return (
    <>
      <PageHeader product="deploy" crumb="Releases" title={`${x.version} → ${x.env}`} searchHint="Search release, commit, instance">
        <Link href="/releases" className="flex items-center gap-1 text-[12px] text-dim hover:text-text">
          <ArrowLeft size={13} /> back
        </Link>
        <span className="ml-auto" />
        {live && (
          <Button size="sm" kind="danger" icon={<Undo2 size={11} />}>
            Roll back to v0.5.0
          </Button>
        )}
      </PageHeader>
      <Page>
        <div className={`panel flex items-center gap-4 px-5 py-4 ${live ? "accent-wash" : ""}`}>
          <StatusBadge status={x.status} />
          <b className="text-[18px] font-semibold tracking-tight">{x.version}</b>
          <span className="font-mono text-[12px] text-muted">
            <GitCommitHorizontal size={13} className="mr-1 inline" />
            {x.commit}
          </span>
          <span className="text-[12.5px] text-muted">{x.message}</span>
          <div className="ml-auto flex items-center gap-6">
            <Stat k="by" v={x.author} />
            <Stat k="strategy" v={x.strategy} />
            <Stat k="started" v={fmtAgo(x.started, NOW)} />
            <Stat k="took" v={x.duration ? fmtDuration(x.duration) : "2 m 12 s…"} />
          </div>
        </div>

        <div className="grid grid-cols-[360px_minmax(0,1fr)] gap-3">
          <Panel title="Pipeline" meta="build → test → migrate → roll out → verify" flush>
            <ol className="stagger">
              {stages.map((s, i) => (
                <li key={s.name} className={`border-t border-hairline px-4 py-3 first:border-0 ${s.status === "running" ? "bg-primary/5" : ""}`}>
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-5 w-5 place-items-center rounded-full border border-hairline bg-elevated">{icon[s.status]}</span>
                    <span className={`text-[13px] font-medium ${s.status === "pending" ? "text-dim" : "text-text"}`}>{s.name}</span>
                    <span className="ml-auto font-mono text-[11px] text-dim tnum">{s.took !== undefined ? fmtDuration(s.took) : s.status === "running" ? "running" : ""}</span>
                  </div>
                  <div className="mt-1 pl-[30px] text-[11.5px] text-muted">{s.detail}</div>
                  {s.steps && (
                    <ul className="mt-2 grid gap-1 pl-[30px]">
                      {s.steps.map((st) => (
                        <li key={st.name} className="flex items-center gap-2 font-mono text-[11.5px]">
                          {icon[st.status]}
                          <span className={st.status === "pending" ? "text-dim" : "text-text"}>{st.name}</span>
                          <span className="ml-auto text-dim tnum">{st.took ? `${st.took} s` : st.status === "running" ? "draining…" : ""}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {i === 3 && (
                    <div className="mt-2 pl-[30px]">
                      <Bar value={live ? 1.5 : 3} max={3} color={theme.primary} height={4} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </Panel>

          <div className="flex flex-col gap-3">
            <Panel title="Instances" meta={`${x.env} · traffic weight`} flush>
              <ul className="stagger">
                {fleet.map((i) => (
                  <li key={i.id} className="grid grid-cols-[110px_90px_90px_1fr_80px] items-center gap-3 border-t border-hairline px-4 py-2.5 first:border-0">
                    <span className="flex items-center gap-2 font-mono text-[12px] text-text">
                      <Dot tone={i.health === "healthy" ? "ok" : i.health === "starting" ? "accent" : i.health === "draining" ? "warn" : "muted"} pulse={i.health === "starting"} />
                      {i.id}
                    </span>
                    <span className={`font-mono text-[12px] ${i.version === x.version ? "text-primary" : "text-muted"}`}>{i.version}</span>
                    <Badge tone={i.health === "healthy" ? "ok" : i.health === "starting" ? "accent" : "muted"}>{i.health}</Badge>
                    <Bar value={i.weight} color={i.version === x.version ? theme.primary : theme.border2} height={5} />
                    <span className="text-right font-mono text-[11px] text-dim tnum">{i.weight}% · {i.rps} rps</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Log" meta="ship · rollout" flush className="flex-1">
              <div className="border-t border-hairline bg-code-bg p-3 font-mono text-[11.5px] leading-[1.7]">
                {rolloutLog.map((l, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="shrink-0 text-dim tnum">{fmtTime(l.t)}</span>
                    <span className={l.l === "ok" ? "text-ok" : l.l === "warn" ? "text-warn" : "text-muted"}>{l.m}</span>
                  </div>
                ))}
                {live && (
                  <div className="flex gap-3">
                    <span className="shrink-0 text-dim tnum">{fmtTime(NOW)}</span>
                    <span className="text-primary">
                      i-9c21: waiting for 3 consecutive healthy checks<span className="animate-pulse">▍</span>
                    </span>
                  </div>
                )}
              </div>
            </Panel>
            <div className="grid grid-cols-2 gap-3">
              <Panel title="Build">
                <KeyList rows={[{ k: "Go", v: "1.25.1 linux/amd64" }, { k: "Image", v: "ghcr.io/acme/api:c41e9d0" }, { k: "Size", v: "21.4 MB" }, { k: "Cache", v: "hit · 48 s" }]} />
              </Panel>
              <Panel title="Migrations" meta={x.migrations ? `${x.migrations} in this release` : "none"}>
                {x.migrations ? (
                  <KeyList rows={[{ k: "0013", v: "projects_search_tsvector" }, { k: "Lock", v: "held 0.3 s" }, { k: "Reversible", v: "yes · down.sql present" }, { k: "Applied", v: "before roll out" }]} />
                ) : (
                  <p className="text-[12px] text-dim">This release changes no schema.</p>
                )}
              </Panel>
            </div>
          </div>
        </div>
      </Page>
    </>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <span className="flex flex-col">
      <span className="font-mono text-[10px] uppercase tracking-wider text-dim">{k}</span>
      <span className="text-[12px] text-text">{v}</span>
    </span>
  );
}
