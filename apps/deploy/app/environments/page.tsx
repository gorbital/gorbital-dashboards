import { Globe, Rocket, Settings2 } from "lucide-react";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Panel, KeyList } from "@gorbital/dash/components/panel";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { fmtAgo } from "@gorbital/dash/lib/format";
import { envs, instances, NOW } from "@/lib/mock";

const toneOf = { healthy: "ok", rolling: "accent", degraded: "danger", idle: "muted" } as const;

export default function Environments() {
  return (
    <>
      <PageHeader product="deploy" title="Environments" searchHint="Search release, commit, instance">
        <Badge tone="muted">3 environments · 1 provider</Badge>
        <Button size="sm" kind="ghost" className="ml-auto">
          New environment
        </Button>
      </PageHeader>
      <Page>
        <div className="grid grid-cols-3 gap-3 stagger">
          {envs.map((e) => {
            const fleet = instances.filter((i) => i.env === e.id);
            return (
              <div key={e.id} className={`panel flex flex-col gap-4 p-5 ${e.id === "production" ? "accent-wash" : ""}`}>
                <div className="flex items-center gap-2">
                  <Dot tone={toneOf[e.status]} pulse={e.status === "rolling"} />
                  <span className="text-[15px] font-semibold tracking-tight">{e.name}</span>
                  <Badge tone={toneOf[e.status]} className="ml-auto">
                    {e.status}
                  </Badge>
                </div>
                <div className="flex items-baseline gap-2">
                  <b className="font-mono text-[24px] font-semibold leading-none tracking-tight">{e.version}</b>
                  <span className="font-mono text-[12px] text-dim">{e.commit}</span>
                </div>
                <a className="flex items-center gap-1.5 font-mono text-[12px] text-muted hover:text-text" href="#">
                  <Globe size={12} /> {e.domain}
                </a>
                <KeyList
                  rows={[
                    { k: "Instances", v: `${e.instances} · ${e.region}` },
                    { k: "Traffic", v: `${e.rps} req/s` },
                    { k: "Since", v: fmtAgo(e.since, NOW) },
                    { k: "Database", v: e.id === "preview" ? "branch of staging" : `${e.id}-pg · 17.2` },
                    { k: "Secrets", v: e.id === "production" ? "14 set · 0 missing" : "11 set · 0 missing" },
                  ]}
                />
                <ul className="grid gap-1">
                  {fleet.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 rounded-md border border-hairline bg-bg/40 px-2.5 py-1.5 font-mono text-[11px]">
                      <Dot tone={i.health === "healthy" ? "ok" : i.health === "starting" ? "accent" : "muted"} />
                      {i.id}
                      <span className="text-dim">{i.version}</span>
                      <span className="ml-auto text-dim">{i.region}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex gap-1.5 pt-1">
                  <Button size="sm" kind={e.id === "production" ? "secondary" : "primary"} icon={<Rocket size={11} />}>
                    Deploy
                  </Button>
                  <Button size="sm" kind="ghost" icon={<Settings2 size={11} />}>
                    Configure
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <Panel title="Promotion" meta="the path a commit takes">
          <ol className="flex items-center gap-3 text-[12px]">
            {[
              ["preview", "every pull request", "ephemeral, DB branch, torn down on merge"],
              ["staging", "every push to main", "recreate, migrations on"],
              ["production", "tag v*", "rolling, one instance at a time, auto rollback on 5xx > 2%"],
            ].map(([n, when, how], i) => (
              <li key={n} className="flex flex-1 items-center gap-3">
                <div className="flex-1 rounded-lg border border-hairline bg-elevated/40 p-3">
                  <div className="flex items-center gap-2 font-medium text-text">
                    {n} <Badge tone="muted">{when}</Badge>
                  </div>
                  <div className="mt-1 text-[11.5px] text-dim">{how}</div>
                </div>
                {i < 2 && <span className="text-dim">→</span>}
              </li>
            ))}
          </ol>
        </Panel>
      </Page>
    </>
  );
}
