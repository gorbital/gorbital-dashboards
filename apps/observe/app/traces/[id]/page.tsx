import Link from "next/link";
import { ArrowLeft, Copy, ExternalLink } from "lucide-react";
import { Page, PageHeader } from "@apistock/dash/components/page";
import { Panel, KeyList, Legend } from "@apistock/dash/components/panel";
import { Badge, StatusCode } from "@apistock/dash/components/badge";
import { Button } from "@apistock/dash/components/button";
import { Code, Key, Str, Num, Cmt } from "@apistock/dash/components/code";
import { Waterfall, spanKindColor } from "@apistock/dash/charts/waterfall";
import { fmtMs, fmtDate } from "@apistock/dash/lib/format";
import { traces } from "@/lib/mock";

export function generateStaticParams() {
  return traces.map((t) => ({ id: t.id }));
}

export default async function TraceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = traces.find((x) => x.id === id) ?? traces[0];
  const sql = t.spans.filter((s) => s.kind === "sql");
  const sqlMs = sql.reduce((a, s) => a + s.duration, 0);
  const failing = t.spans.find((s) => s.error && s.depth > 0);
  const slowest = [...t.spans].filter((x) => x.depth > 0).sort((a, b) => b.duration - a.duration)[0];
  return (
    <>
      <PageHeader product="observe" crumb="Traces" title={t.id.slice(0, 16)} searchHint="Search trace ID, span, route">
        <Link href="/traces" className="flex items-center gap-1 text-[12px] text-dim hover:text-text">
          <ArrowLeft size={13} /> back
        </Link>
        <Button kind="ghost" size="sm" icon={<Copy size={12} />}>
          Copy ID
        </Button>
      </PageHeader>
      <Page>
        <div className="panel flex items-center gap-4 px-5 py-4">
          <StatusCode code={t.status} />
          <h2 className="font-mono text-[15px] font-semibold text-text">{t.name}</h2>
          <span className="font-mono text-[12px] text-dim">{fmtDate(t.at)} UTC</span>
          <div className="ml-auto flex items-center gap-6 text-[12px]">
            <Stat k="duration" v={fmtMs(t.ms)} />
            <Stat k="spans" v={String(t.spans.length)} />
            <Stat k="sql" v={`${sql.length} · ${fmtMs(sqlMs)}`} />
            <Stat k="org" v={t.org} />
            <Stat k="instance" v={t.instance} />
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-3">
          <Panel
            title="Waterfall"
            meta={`${t.spans.length} spans`}
            actions={<Legend items={[{ label: "http", color: spanKindColor.http }, { label: "internal", color: spanKindColor.internal }, { label: "sql", color: spanKindColor.sql }, { label: "cache", color: spanKindColor.cache }, { label: "mail", color: spanKindColor.mail }, { label: "job", color: spanKindColor.job }]} />}
          >
            <Waterfall spans={t.spans} selected={failing?.id} />
          </Panel>
          <div className="flex flex-col gap-3">
            <Panel title="Request">
              <KeyList
                rows={[
                  { k: "Request ID", v: t.requestId },
                  { k: "Trace ID", v: t.id },
                  { k: "Actor", v: "usr_3f9a1c" },
                  { k: "Session", v: "ses_…a91f" },
                  { k: "Client", v: "203.0.113.42" },
                  { k: "Release", v: "v0.5.0 · 8f1c2ab" },
                ]}
              />
              <div className="mt-3 flex gap-1.5">
                <Button size="sm" icon={<ExternalLink size={11} />}>
                  Logs for request
                </Button>
                <Button size="sm" kind="ghost">
                  Audit events
                </Button>
              </div>
            </Panel>
            {failing ? (
              <Panel title="Error" meta={failing.name}>
                <Code className="text-danger">
                  dial tcp 10.0.3.12:587: i/o timeout
                  {"\n"}
                  <Cmt>modules/mail/smtp.go:142</Cmt>
                </Code>
                <div className="mt-3 flex items-center gap-2 text-[12px] text-muted">
                  Grouped with <Badge tone="danger">47 others</Badge>
                  <Link href="/errors" className="ml-auto text-[11px] text-dim hover:text-text">
                    open group →
                  </Link>
                </div>
              </Panel>
            ) : (
              <Panel title="Slowest span" meta={fmtMs(slowest.duration)}>
                <Code>
                  <Key>{slowest.kind}</Key> <Str>{slowest.name}</Str>
                  {"\n"}
                  <Cmt>start</Cmt> <Num>{slowest.start.toFixed(1)}ms</Num> <Cmt>dur</Cmt> <Num>{slowest.duration.toFixed(1)}ms</Num>
                </Code>
              </Panel>
            )}
            <Panel title="Attributes">
              <Code>
                <Key>http.route</Key>: <Str>&quot;{t.name.split(" ")[1]}&quot;</Str>
                {"\n"}
                <Key>http.status_code</Key>: <Num>{t.status}</Num>
                {"\n"}
                <Key>apistock.org</Key>: <Str>&quot;{t.org}&quot;</Str>
                {"\n"}
                <Key>apistock.request_id</Key>: <Str>&quot;{t.requestId}&quot;</Str>
                {"\n"}
                <Key>db.system</Key>: <Str>&quot;postgresql&quot;</Str>
                {"\n"}
                <Key>service.version</Key>: <Str>&quot;v0.5.0&quot;</Str>
              </Code>
            </Panel>
          </div>
        </div>
      </Page>
    </>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <span className="flex flex-col">
      <span className="font-mono text-[10px] uppercase tracking-wider text-dim">{k}</span>
      <span className="font-mono text-[12px] text-text tnum">{v}</span>
    </span>
  );
}
