import Link from "next/link";
import { Rocket } from "lucide-react";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Pill, Segmented } from "@gorbital/dash/components/pill";
import { Panel } from "@gorbital/dash/components/panel";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Table } from "@gorbital/dash/components/table";
import { fmtAgo, fmtDuration } from "@gorbital/dash/lib/format";
import { releases, NOW, type Release } from "@/lib/mock";
import { StatusBadge } from "@/components/status";

export default function Releases() {
  return (
    <>
      <PageHeader product="deploy" title="Releases" searchHint="Search release, commit, instance">
        <Segmented options={[{ value: "all", label: "All" }, { value: "production", label: "Production" }, { value: "staging", label: "Staging" }, { value: "preview", label: "Preview" }]} value="all" />
        <Pill>Any status</Pill>
        <Button kind="primary" size="sm" icon={<Rocket size={12} />} className="ml-2">
          Deploy
        </Button>
      </PageHeader>
      <Page>
        <Panel title="Releases" meta="one per version and commit per environment, newest first" flush>
          <Table<Release>
            rows={releases}
            rowKey={(x) => x.id}
            columns={[
              { key: "s", header: "Status", width: "110px", cell: (x) => <StatusBadge status={x.status} /> },
              {
                key: "v",
                header: "Release",
                width: "120px",
                cell: (x) => (
                  <Link href={`/releases/${x.id}`} className="font-mono text-[12.5px] font-medium text-text hover:text-primary">
                    {x.version}
                  </Link>
                ),
              },
              { key: "c", header: "Commit", width: "90px", cell: (x) => <span className="font-mono text-dim">{x.commit}</span> },
              { key: "m", header: "Message", cell: (x) => <span className="text-muted">{x.message}</span> },
              { key: "e", header: "Env", width: "100px", cell: (x) => <Badge tone={x.env === "production" ? "accent" : "muted"}>{x.env}</Badge> },
              { key: "st", header: "Strategy", width: "100px", cell: (x) => <span className="font-mono text-dim">{x.strategy}</span> },
              { key: "mig", header: "Migr.", width: "56px", align: "right", cell: (x) => <span className={`font-mono tnum ${x.migrations ? "text-warn" : "text-dim"}`}>{x.migrations || "–"}</span> },
              { key: "i", header: "Inst.", width: "56px", align: "right", cell: (x) => <span className="font-mono text-dim tnum">{x.instances}</span> },
              { key: "d", header: "Took", width: "80px", align: "right", cell: (x) => <span className="font-mono text-muted tnum">{x.duration ? fmtDuration(x.duration) : "…"}</span> },
              { key: "a", header: "By", width: "140px", cell: (x) => <span className="text-muted">{x.author}</span> },
              { key: "t", header: "", width: "90px", align: "right", cell: (x) => <span className="text-dim">{fmtAgo(x.started, NOW)}</span> },
            ]}
          />
        </Panel>
      </Page>
    </>
  );
}
