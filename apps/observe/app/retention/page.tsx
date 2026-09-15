import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Panel } from "@gorbital/dash/components/panel";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Table } from "@gorbital/dash/components/table";
import { Split } from "@gorbital/dash/components/progress";
import { theme } from "@gorbital/dash/theme";
import { fmtDuration } from "@gorbital/dash/lib/format";
import { retention, NOW } from "@/lib/mock";

type Row = (typeof retention)[number];

export default function Retention() {
  return (
    <>
      <PageHeader product="observe" title="Retention" searchHint="Search settings">
        <Badge tone="muted">runtime settings · /ops/retention</Badge>
      </PageHeader>
      <Page>
        <div className="panel accent-wash flex items-center gap-6 px-5 py-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-dim">Stored</div>
            <b className="text-[26px] font-semibold tracking-tight tnum">22.0 GB</b>
            <span className="ml-2 text-[12px] text-dim">of 50 GB plan</span>
          </div>
          <div className="flex-1">
            <Split parts={[{ value: 11.4, color: theme.primary }, { value: 6.2, color: theme.muted }, { value: 3.9, color: theme.border2 }, { value: 0.45, color: theme.warn }, { value: 28, color: "transparent" }]} height={10} />
            <div className="mt-2 flex gap-4 font-mono text-[10.5px] text-dim">
              <span><i className="mr-1 inline-block h-2 w-2 rounded-[2px] bg-primary" />traces 11.4</span>
              <span><i className="mr-1 inline-block h-2 w-2 rounded-[2px] bg-muted" />requests 6.2</span>
              <span><i className="mr-1 inline-block h-2 w-2 rounded-[2px] bg-border-2" />logs 3.9</span>
              <span><i className="mr-1 inline-block h-2 w-2 rounded-[2px] bg-warn" />other 0.45</span>
            </div>
          </div>
          <Button>Edit plan</Button>
        </div>
        <Panel title="Retention by data set" meta="enforced by the retention job, nightly 03:00 UTC" flush>
          <Table<Row>
            rows={retention}
            rowKey={(r) => r.key}
            columns={[
              { key: "k", header: "Data set", cell: (r) => <span className="font-mono text-text">{r.key}</span> },
              { key: "v", header: "Keep", width: "120px", cell: (r) => <Badge tone="accent">{r.value}</Badge> },
              { key: "rows", header: "Rows", width: "100px", align: "right", cell: (r) => <span className="font-mono text-muted tnum">{r.rows}</span> },
              { key: "size", header: "Size", width: "100px", align: "right", cell: (r) => <span className="font-mono text-muted tnum">{r.size}</span> },
              { key: "next", header: "Next prune", width: "120px", align: "right", cell: (r) => <span className="font-mono text-dim">in {fmtDuration((r.next - NOW) / 1000)}</span> },
              { key: "e", header: "", width: "80px", align: "right", cell: () => <Button size="sm" kind="ghost">Change</Button> },
            ]}
          />
        </Panel>
        <Panel title="History" meta="every change has a reason and a version">
          <ul className="grid gap-2 text-[12px]">
            {[
              ["v3", "traces 14 days → 7 days", "Muhammad Qazi", "storage budget", "12 days ago"],
              ["v2", "errors 30 days → 90 days", "Ada Lovelace", "keep regressions visible across releases", "40 days ago"],
              ["v1", "defaults", "system", "initial", "41 days ago"],
            ].map(([v, what, who, why, when]) => (
              <li key={v} className="grid grid-cols-[40px_1fr_140px_1fr_90px] items-center gap-3 border-t border-hairline pt-2 first:border-0 first:pt-0">
                <Badge>{v}</Badge>
                <span className="font-mono text-text">{what}</span>
                <span className="text-muted">{who}</span>
                <span className="truncate text-dim">“{why}”</span>
                <span className="text-right text-dim">{when}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </Page>
    </>
  );
}
