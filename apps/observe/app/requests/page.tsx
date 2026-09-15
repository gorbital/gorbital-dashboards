import Link from "next/link";
import { Page, PageHeader } from "@apistock/dash/components/page";
import { Pill, Segmented } from "@apistock/dash/components/pill";
import { Tile, TileGrid } from "@apistock/dash/components/tile";
import { Panel, Legend } from "@apistock/dash/components/panel";
import { Method, StatusCode } from "@apistock/dash/components/badge";
import { Table } from "@apistock/dash/components/table";
import { Heatmap } from "@apistock/dash/charts/heatmap";
import { theme } from "@apistock/dash/theme";
import { fmtInt, fmtMs, fmtTime, fmtAgo } from "@apistock/dash/lib/format";
import { requests, totals, p95, latencyHeat, latencyBuckets, hours, NOW, type Request } from "@/lib/mock";

export default function Requests() {
  return (
    <>
      <PageHeader product="observe" title="Requests" searchHint="Search path, request ID, org">
        <Pill dot="ok">Last 24 hours</Pill>
        <Pill>All instances</Pill>
        <Pill>Any status</Pill>
        <Segmented options={[{ value: "all", label: "All" }, { value: "slow", label: "Slow" }, { value: "errors", label: "Errors" }]} value="all" />
      </PageHeader>
      <Page>
        <TileGrid>
          <Tile label="Requests" value={fmtInt(totals.requests)} delta="+4.2%" hero />
          <Tile label="Per second" value="61.2" unit="avg" delta="peak 148" deltaTone="flat" />
          <Tile label="p95" value={fmtMs(p95[23])} delta="−3 ms" />
          <Tile label="4xx / 5xx" value={fmtInt(totals.client)} unit={`/ ${fmtInt(totals.server)}`} delta="+0.08%" deltaTone="bad" />
        </TileGrid>
        <Panel title="Latency distribution" meta="requests per hour × latency bucket" actions={<Legend items={[{ label: "more requests", color: theme.primary }]} />}>
          <Heatmap rows={latencyHeat} rowLabels={latencyBuckets} colLabels={hours} cell={22} gap={3} />
        </Panel>
        <Panel title="Requests" meta={`${requests.length} of ${fmtInt(totals.requests)}`} flush>
          <Table<Request>
            rows={requests}
            rowKey={(r) => r.id}
            columns={[
              { key: "at", header: "Time", width: "90px", cell: (r) => <span className="font-mono text-dim tnum">{fmtTime(r.at)}</span> },
              { key: "m", header: "Method", width: "76px", cell: (r) => <Method m={r.method} /> },
              {
                key: "p",
                header: "Path",
                cell: (r) => (
                  <Link href={`/traces/${r.traceId}`} className="font-mono text-text hover:text-primary">
                    {r.path}
                  </Link>
                ),
              },
              { key: "s", header: "Status", width: "70px", cell: (r) => <StatusCode code={r.status} /> },
              { key: "ms", header: "Duration", width: "90px", align: "right", cell: (r) => <span className={`font-mono tnum ${r.ms > 200 ? "text-warn" : "text-muted"}`}>{fmtMs(r.ms)}</span> },
              { key: "sql", header: "SQL", width: "56px", align: "right", cell: (r) => <span className="font-mono text-dim tnum">{r.sql}</span> },
              { key: "org", header: "Org", width: "100px", cell: (r) => <span className="font-mono text-muted">{r.org}</span> },
              { key: "actor", header: "Actor", width: "110px", cell: (r) => <span className="font-mono text-dim">{r.actor}</span> },
              { key: "i", header: "Instance", width: "80px", cell: (r) => <span className="font-mono text-dim">{r.instance}</span> },
              { key: "id", header: "Request ID", width: "150px", cell: (r) => <span className="font-mono text-dim">{r.id}</span> },
              { key: "ago", header: "", width: "70px", align: "right", cell: (r) => <span className="text-dim">{fmtAgo(r.at, NOW)}</span> },
            ]}
          />
        </Panel>
      </Page>
    </>
  );
}
