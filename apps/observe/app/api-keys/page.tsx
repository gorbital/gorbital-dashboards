import { Plus, RotateCw, Trash2 } from "lucide-react";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Panel } from "@gorbital/dash/components/panel";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Table } from "@gorbital/dash/components/table";
import { Code, Key, Str, Cmt } from "@gorbital/dash/components/code";
import { fmtAgo } from "@gorbital/dash/lib/format";
import { apiKeys, NOW } from "@/lib/mock";

type Row = (typeof apiKeys)[number];

export default function ApiKeys() {
  return (
    <>
      <PageHeader product="observe" title="API keys" searchHint="Search keys">
        <Button kind="primary" size="sm" icon={<Plus size={12} />} className="ml-2">
          New key
        </Button>
      </PageHeader>
      <Page>
        <Panel title="Keys" meta="an app sends with an ingest key; readers use a read key" flush>
          <Table<Row>
            rows={apiKeys}
            rowKey={(k) => k.prefix}
            columns={[
              { key: "n", header: "Name", cell: (k) => <span className="text-text">{k.name}</span> },
              { key: "p", header: "Key", width: "170px", cell: (k) => <span className="font-mono text-muted">{k.prefix}…</span> },
              { key: "s", header: "Scope", width: "90px", cell: (k) => <Badge tone={k.scope === "ingest" ? "accent" : "muted"}>{k.scope}</Badge> },
              { key: "c", header: "Created", width: "110px", cell: (k) => <span className="text-dim">{fmtAgo(k.created, NOW)}</span> },
              { key: "l", header: "Last used", width: "110px", cell: (k) => <span className="text-dim">{fmtAgo(k.last, NOW)}</span> },
              { key: "b", header: "By", width: "140px", cell: (k) => <span className="text-muted">{k.by}</span> },
              {
                key: "a",
                header: "",
                width: "150px",
                align: "right",
                cell: () => (
                  <span className="inline-flex gap-1">
                    <Button size="sm" kind="ghost" icon={<RotateCw size={11} />}>Rotate</Button>
                    <Button size="sm" kind="ghost" icon={<Trash2 size={11} />}>Revoke</Button>
                  </span>
                ),
              },
            ]}
          />
        </Panel>
        <Panel title="Connect an app" meta="two lines in the environment; the library does the rest">
          <Code>
            <Cmt># .env</Cmt>
            {"\n"}
            <Key>OBSERVE_URL</Key>=<Str>https://ingest.gauge.gorbital.dev</Str>
            {"\n"}
            <Key>OBSERVE_KEY</Key>=<Str>gau_live_7f3a…</Str>
            {"\n\n"}
            <Cmt># the app already exports OpenTelemetry through modules/telemetry;</Cmt>
            {"\n"}
            <Cmt># requests, SQL, jobs, mail and errors arrive with their request IDs.</Cmt>
          </Code>
        </Panel>
      </Page>
    </>
  );
}
