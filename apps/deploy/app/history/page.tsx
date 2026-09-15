import { Rocket, Undo2, Database, Flame, Scaling, SlidersHorizontal } from "lucide-react";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Pill, Segmented } from "@gorbital/dash/components/pill";
import { Panel } from "@gorbital/dash/components/panel";
import { Badge } from "@gorbital/dash/components/badge";
import { fmtAgo, fmtDate } from "@gorbital/dash/lib/format";
import { history, NOW, type Event } from "@/lib/mock";

const meta: Record<Event["kind"], { Icon: typeof Rocket; tone: "accent" | "warn" | "info" | "danger" | "muted" | "violet" }> = {
  deploy: { Icon: Rocket, tone: "accent" },
  rollback: { Icon: Undo2, tone: "warn" },
  migration: { Icon: Database, tone: "info" },
  incident: { Icon: Flame, tone: "danger" },
  scale: { Icon: Scaling, tone: "violet" },
  config: { Icon: SlidersHorizontal, tone: "muted" },
};

export default function HistoryPage() {
  return (
    <>
      <PageHeader product="deploy" title="History" searchHint="Search release, commit, instance">
        <Segmented options={[{ value: "all", label: "All" }, { value: "deploys", label: "Deploys" }, { value: "incidents", label: "Incidents" }, { value: "config", label: "Config" }]} value="all" />
        <Pill>All environments</Pill>
      </PageHeader>
      <Page>
        <Panel title="Timeline" meta="deploys, rollbacks, migrations, incidents and config, in one line" flush>
          <ol className="relative ml-6 stagger">
            <i className="absolute left-[9px] top-0 bottom-0 border-l border-hairline" />
            {history.map((e, i) => {
              const m = meta[e.kind];
              return (
                <li key={i} className="relative flex gap-4 px-4 py-3.5">
                  <span className="absolute -left-[4px] top-[18px] grid h-[26px] w-[26px] -translate-x-1/2 place-items-center rounded-full border border-hairline bg-surface">
                    <m.Icon size={12} className={{ accent: "text-primary", warn: "text-warn", info: "text-info", danger: "text-danger", violet: "text-violet", muted: "text-dim" }[m.tone]} />
                  </span>
                  <div className="ml-4 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-text">{e.title}</span>
                      <Badge tone={m.tone}>{e.kind}</Badge>
                      <Badge tone="muted">{e.env}</Badge>
                      <span className="ml-auto font-mono text-[11px] text-dim">{fmtDate(e.at)} · {fmtAgo(e.at, NOW)}</span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted">
                      {e.detail} · <span className="text-dim">{e.who}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Panel>
      </Page>
    </>
  );
}
