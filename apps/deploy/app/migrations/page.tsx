import { Play, AlertTriangle } from "lucide-react";
import { Page, PageHeader } from "@apistock/dash/components/page";
import { Tile, TileGrid } from "@apistock/dash/components/tile";
import { Panel } from "@apistock/dash/components/panel";
import { Badge } from "@apistock/dash/components/badge";
import { Button } from "@apistock/dash/components/button";
import { Table } from "@apistock/dash/components/table";
import { Code, Cmt } from "@apistock/dash/components/code";
import { migrations } from "@/lib/mock";

type Row = (typeof migrations)[number];

function Cell({ v }: { v: string }) {
  if (v === "applied") return <Badge tone="ok">applied</Badge>;
  if (v === "applying") return <Badge tone="accent">applying</Badge>;
  if (v === "pending") return <Badge tone="warn">pending</Badge>;
  return <span className="text-faint">—</span>;
}

export default function Migrations() {
  return (
    <>
      <PageHeader product="deploy" title="Migrations" searchHint="Search release, commit, instance">
        <Badge tone="muted">cmd/migrate · run before roll out, once per release</Badge>
      </PageHeader>
      <Page>
        <TileGrid>
          <Tile label="Schema" value="0013" unit="latest" delta="applying to production" deltaTone="flat" hero />
          <Tile label="Drift" value="0" unit="environments" delta="staging = production − 0" />
          <Tile label="Longest lock" value="1.1" unit="s" delta="0009 · partition" deltaTone="flat" />
          <Tile label="Irreversible" value="3" unit="of 13" delta="no down.sql" deltaTone="bad" />
        </TileGrid>
        <Panel title="Migrations by environment" flush>
          <Table<Row>
            rows={migrations}
            rowKey={(m) => m.v}
            columns={[
              { key: "v", header: "Version", width: "80px", cell: (m) => <span className="font-mono text-text">{m.v}</span> },
              { key: "n", header: "Name", cell: (m) => <span className="font-mono text-muted">{m.name}</span> },
              { key: "p", header: "Production", width: "110px", cell: (m) => <Cell v={m.production} /> },
              { key: "s", header: "Staging", width: "110px", cell: (m) => <Cell v={m.staging} /> },
              { key: "pr", header: "Preview", width: "110px", cell: (m) => <Cell v={m.preview} /> },
              { key: "ms", header: "Took", width: "80px", align: "right", cell: (m) => <span className="font-mono text-dim tnum">{m.ms} ms</span> },
              { key: "l", header: "Lock", width: "80px", align: "right", cell: (m) => <span className={`font-mono tnum ${m.lock !== "—" ? "text-warn" : "text-dim"}`}>{m.lock}</span> },
              { key: "r", header: "Reversible", width: "100px", cell: (m) => (m.reversible ? <Badge tone="muted">down.sql</Badge> : <Badge tone="warn"><AlertTriangle size={10} /> no</Badge>) },
            ]}
          />
        </Panel>
        <div className="grid grid-cols-2 gap-3">
          <Panel title="0013_projects_search_tsvector" meta="up.sql" actions={<Button size="sm" kind="ghost" icon={<Play size={11} />}>Dry run on preview</Button>}>
            <Code>
              <Cmt>-- adds a generated tsvector and a GIN index; concurrently, no long lock</Cmt>
              {"\n"}
              <span className="text-primary">ALTER TABLE</span> projects{"\n  "}
              <span className="text-primary">ADD COLUMN</span> search tsvector{"\n  "}
              <span className="text-primary">GENERATED ALWAYS AS</span> (to_tsvector(&apos;simple&apos;, name || &apos; &apos; || coalesce(description, &apos;&apos;))) <span className="text-primary">STORED</span>;{"\n\n"}
              <span className="text-primary">CREATE INDEX CONCURRENTLY</span> projects_search_idx{"\n  "}
              <span className="text-primary">ON</span> projects <span className="text-primary">USING</span> gin (search);
            </Code>
          </Panel>
          <Panel title="Policy" meta="what ship checks before it runs a migration">
            <ul className="grid gap-2.5 text-[12px]">
              {[
                ["ok", "Runs once per release, on one instance, before the roll out starts."],
                ["ok", "Fails the release if a lock is not acquired in 10 s; nothing is rolled out."],
                ["ok", "Migrations that drop columns or tables need a second approval."],
                ["warn", "3 migrations have no down.sql; a rollback of those releases keeps the schema."],
              ].map(([t, txt]) => (
                <li key={txt} className="flex gap-2.5">
                  <i className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${t === "ok" ? "bg-ok" : "bg-warn"}`} />
                  <span className="text-muted">{txt}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </Page>
    </>
  );
}
