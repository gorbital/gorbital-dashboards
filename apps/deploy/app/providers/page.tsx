import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Panel, KeyList } from "@gorbital/dash/components/panel";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code, Key, Str, Cmt } from "@gorbital/dash/components/code";
import { providers } from "@/lib/mock";

export default function Providers() {
  return (
    <>
      <PageHeader product="deploy" title="Providers" searchHint="Search release, commit, instance">
        <Badge tone="muted">where releases run</Badge>
      </PageHeader>
      <Page>
        <div className="grid grid-cols-4 gap-3 stagger">
          {providers.map((p) => (
            <div key={p.name} className={`panel flex flex-col gap-3 p-4 ${p.primary ? "accent-wash" : ""}`}>
              <div className="flex items-center gap-2">
                <Dot tone={p.status === "connected" ? "ok" : "muted"} />
                <span className="text-[14px] font-semibold tracking-tight">{p.name}</span>
                {p.primary && <Badge tone="accent" className="ml-auto">primary</Badge>}
              </div>
              <p className="text-[12px] leading-relaxed text-muted">{p.detail}</p>
              <Button size="sm" kind={p.primary ? "secondary" : "ghost"} className="mt-auto self-start">
                {p.primary ? "Configure" : "Connect"}
              </Button>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Panel title="Fly.io" meta="connected 40 days ago">
            <KeyList rows={[{ k: "Org", v: "acme" }, { k: "App", v: "acme-api" }, { k: "Regions", v: "ams (primary)" }, { k: "Machines", v: "3 × shared-2x · 1 GB" }, { k: "Token", v: "fo1_…9c2a · deploy scope" }, { k: "Postgres", v: "acme-api-pg · 17.2 · 2 nodes" }]} />
          </Panel>
          <Panel title="ship.toml" meta="committed beside the app">
            <Code>
              <Key>app</Key> = <Str>&quot;acme-api&quot;</Str>
              {"\n"}
              <Key>provider</Key> = <Str>&quot;fly&quot;</Str>
              {"\n\n"}
              [<Key>production</Key>]{"\n"}
              <Key>strategy</Key> = <Str>&quot;rolling&quot;</Str>
              {"\n"}
              <Key>instances</Key> = 3{"\n"}
              <Key>drain</Key> = <Str>&quot;20s&quot;</Str>
              {"\n"}
              <Key>rollback_on</Key> = <Str>&quot;5xx &gt; 2% for 60s&quot;</Str>
              {"\n\n"}
              [<Key>staging</Key>]{"\n"}
              <Key>strategy</Key> = <Str>&quot;recreate&quot;</Str>
              {"\n"}
              <Cmt># migrations run before every roll out; needs a down.sql to be reversible</Cmt>
            </Code>
          </Panel>
        </div>
      </Page>
    </>
  );
}
