import { Pencil, RotateCcw } from "lucide-react";
import { Page, PageHeader } from "@apistock/dash/components/page";
import { Segmented } from "@apistock/dash/components/pill";
import { Panel } from "@apistock/dash/components/panel";
import { Badge, Dot } from "@apistock/dash/components/badge";
import { Button } from "@apistock/dash/components/button";
import { Table } from "@apistock/dash/components/table";
import { settings, type Setting } from "@/lib/mock";

export default function Settings() {
  const changed = settings.filter((s) => s.value !== s.def);
  return (
    <>
      <PageHeader product="devtools" title="Settings" searchHint="Jump to route, module, setting">
        <Badge tone="muted">runtime settings · /ops/settings</Badge>
        <Segmented options={[{ value: "all", label: "All" }, { value: "changed", label: `Changed (${changed.length})` }]} value="all" />
      </PageHeader>
      <Page>
        <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-3">
          <Panel title="Declared in code" meta="stored in PostgreSQL only when changed, applied live" flush>
            <Table<Setting>
              rows={settings}
              rowKey={(s) => s.key}
              columns={[
                {
                  key: "k",
                  header: "Key",
                  cell: (s) => (
                    <span className="flex items-center gap-2 font-mono text-text">
                      <Dot tone={s.live ? "ok" : "muted"} />
                      {s.key}
                    </span>
                  ),
                },
                {
                  key: "v",
                  header: "Value",
                  width: "190px",
                  cell: (s) => <span className={`font-mono ${s.value !== s.def ? "text-primary" : "text-muted"}`}>{s.value === "" ? <span className="text-faint">(empty)</span> : s.value}</span>,
                },
                { key: "d", header: "Default", width: "160px", cell: (s) => <span className="font-mono text-dim">{s.def === "" ? "(empty)" : s.def}</span> },
                { key: "t", header: "Type", width: "90px", cell: (s) => <Badge tone="muted">{s.type}</Badge> },
                { key: "b", header: "Bounds", width: "120px", cell: (s) => <span className="font-mono text-dim">{s.bounds ?? "—"}</span> },
                { key: "ver", header: "v", width: "40px", align: "right", cell: (s) => <span className="font-mono text-dim tnum">{s.version}</span> },
                {
                  key: "a",
                  header: "",
                  width: "60px",
                  align: "right",
                  cell: (s) => (
                    <Button size="sm" kind="ghost" icon={s.value !== s.def ? <RotateCcw size={11} /> : <Pencil size={11} />}>
                      {s.value !== s.def ? "Reset" : "Edit"}
                    </Button>
                  ),
                },
              ]}
            />
          </Panel>
          <div className="flex flex-col gap-3">
            <Panel title="Edit" meta="auth.lockout_after">
              <div className="grid gap-3 text-[12px]">
                <label className="grid gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-dim">Value · int · 3 – 50</span>
                  <div className="flex items-center rounded-md border border-primary/40 bg-code-bg px-2.5 py-2 font-mono text-text">
                    8<span className="ml-0.5 animate-pulse text-primary">|</span>
                  </div>
                </label>
                <label className="grid gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-dim">Reason · required</span>
                  <div className="rounded-md border border-border bg-code-bg px-2.5 py-2 text-muted">brute-force test</div>
                </label>
                <div className="flex items-center gap-2">
                  <Button kind="primary" size="sm">
                    Save as v4
                  </Button>
                  <Button size="sm" kind="ghost">
                    Cancel
                  </Button>
                  <span className="ml-auto font-mono text-[10.5px] text-dim">applied on 1 instance via NOTIFY</span>
                </div>
              </div>
            </Panel>
            <Panel title="History" meta="every change has a reason" flush>
              <ul className="stagger">
                {[
                  ["auth.lockout_after", "10 → 8", "v3", "brute-force test", "2 days ago"],
                  ["auth.lockout_after", "8 → 10", "v2", "revert after test", "3 days ago"],
                  ["mail.sender_name", "acme-api → acme-api (dev)", "v2", "tell dev mail apart", "5 days ago"],
                ].map(([k, chg, v, why, when], i) => (
                  <li key={i} className="border-t border-hairline px-4 py-2.5 first:border-0">
                    <div className="flex items-center gap-2 font-mono text-[12px]">
                      <span className="text-text">{k}</span>
                      <Badge>{v}</Badge>
                      <span className="ml-auto text-[11px] text-dim">{when}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted">{chg}</div>
                    <div className="text-[11px] text-dim">“{why}” · you</div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </Page>
    </>
  );
}
