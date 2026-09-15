import { Page, PageHeader } from "@apistock/dash/components/page";
import { Panel } from "@apistock/dash/components/panel";
import { Badge, Dot } from "@apistock/dash/components/badge";
import { Button } from "@apistock/dash/components/button";
import { notifications } from "@/lib/mock";

export default function Notifications() {
  return (
    <>
      <PageHeader product="deploy" title="Notifications" searchHint="Search release, commit, instance">
        <Button size="sm" kind="primary" className="ml-auto">
          Add channel
        </Button>
      </PageHeader>
      <Page>
        <Panel title="Channels" meta="who hears about what" flush>
          <ul className="stagger">
            {notifications.map((n) => (
              <li key={n.channel} className="flex items-center gap-4 border-t border-hairline px-4 py-3.5 first:border-0">
                <Dot tone={n.enabled ? "ok" : "muted"} />
                <span className="w-[220px] text-[13px] font-medium text-text">{n.channel}</span>
                <span className="flex flex-wrap gap-1.5">
                  {n.on.map((e) => (
                    <Badge key={e} tone={e.includes("fail") || e.includes("rollback") ? "warn" : "muted"}>
                      {e}
                    </Badge>
                  ))}
                </span>
                <Button size="sm" kind="ghost" className="ml-auto">
                  {n.enabled ? "Disable" : "Enable"}
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Last sent" meta="Slack #deploys · 3 min ago">
          <div className="rounded-lg border border-hairline bg-elevated/40 p-4 text-[12.5px]">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded bg-primary text-[10px] font-bold text-bg">s</span>
              <b>ship</b>
              <span className="text-dim">APP · 14:29</span>
            </div>
            <p className="mt-2 text-muted">
              <b className="text-text">v0.5.1</b> (c41e9d0) is rolling out to <b className="text-text">production</b> — 1 of 3 instances done. “projects: full-text search on name and description” by Muhammad Qazi.
            </p>
          </div>
        </Panel>
      </Page>
    </>
  );
}
