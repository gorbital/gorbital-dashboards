import Link from "next/link";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Pill } from "@gorbital/dash/components/pill";
import { Panel, Legend } from "@gorbital/dash/components/panel";
import { Badge, StatusCode } from "@gorbital/dash/components/badge";
import { Table } from "@gorbital/dash/components/table";
import { spanKindColor } from "@gorbital/dash/charts/waterfall";
import { fmtMs, fmtTime } from "@gorbital/dash/lib/format";
import { theme } from "@gorbital/dash/theme";
import { traces, type Trace } from "@/lib/mock";

export default function Traces() {
  return (
    <>
      <PageHeader product="observe" title="Traces" searchHint="Search trace ID, span, route">
        <Pill dot="ok">Last 24 hours</Pill>
        <Pill>Any duration</Pill>
      </PageHeader>
      <Page>
        <Panel
          title="Recent traces"
          meta="one per request, sampled at 100%"
          flush
          actions={<Legend items={[{ label: "http", color: spanKindColor.http }, { label: "sql", color: spanKindColor.sql }, { label: "job", color: spanKindColor.job }, { label: "mail", color: spanKindColor.mail }, { label: "external", color: spanKindColor.ext }]} />}
        >
          <Table<Trace>
            rows={traces}
            rowKey={(t) => t.id}
            columns={[
              { key: "at", header: "Time", width: "90px", cell: (t) => <span className="font-mono text-dim tnum">{fmtTime(t.at)}</span> },
              {
                key: "name",
                header: "Root span",
                cell: (t) => (
                  <Link href={`/traces/${t.id}`} className="font-mono text-text hover:text-primary">
                    {t.name}
                  </Link>
                ),
              },
              { key: "status", header: "Status", width: "70px", cell: (t) => <StatusCode code={t.status} /> },
              {
                key: "spans",
                header: "Spans",
                width: "260px",
                cell: (t) => (
                  <div className="flex h-3 w-full gap-px overflow-hidden rounded-sm bg-elevated">
                    {t.spans
                      .filter((s) => s.depth > 0)
                      .map((s) => (
                        <i key={s.id} className="h-full" style={{ width: `${Math.max(1.5, (s.duration / t.ms) * 100)}%`, background: s.error ? theme.danger : spanKindColor[s.kind], opacity: 0.85 }} />
                      ))}
                  </div>
                ),
              },
              { key: "n", header: "#", width: "48px", align: "right", cell: (t) => <span className="font-mono text-dim tnum">{t.spans.length}</span> },
              { key: "ms", header: "Duration", width: "90px", align: "right", cell: (t) => <span className={`font-mono tnum ${t.ms > 200 ? "text-warn" : "text-muted"}`}>{fmtMs(t.ms)}</span> },
              { key: "org", header: "Org", width: "100px", cell: (t) => <span className="font-mono text-muted">{t.org}</span> },
              { key: "i", header: "Instance", width: "80px", cell: (t) => <span className="font-mono text-dim">{t.instance}</span> },
              { key: "id", header: "Trace", width: "170px", cell: (t) => <Badge>{t.id.slice(0, 12)}…</Badge> },
            ]}
          />
        </Panel>
      </Page>
    </>
  );
}
