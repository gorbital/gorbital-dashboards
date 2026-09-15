import { Page, PageHeader } from "@apistock/dash/components/page";
import { Segmented } from "@apistock/dash/components/pill";
import { Panel, KeyList, Legend } from "@apistock/dash/components/panel";
import { Badge } from "@apistock/dash/components/badge";
import { Code, Key, Str, Cmt } from "@apistock/dash/components/code";
import { theme } from "@apistock/dash/theme";
import { nodes, edges, type Node } from "@/lib/mock";

const kindColor: Record<Node["kind"], string> = { app: theme.primary, handler: theme.text, module: theme.info, infra: theme.muted };
const W = 150;
const H = 34;

export default function Modules() {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const sel = byId.mail;
  const inbound = edges.filter((e) => e.to === sel.id);
  const outbound = edges.filter((e) => e.from === sel.id);
  return (
    <>
      <PageHeader product="devtools" title="Modules" searchHint="Jump to route, module, setting">
        <Badge tone="muted">read from source · internal/app</Badge>
        <Segmented options={[{ value: "wiring", label: "Wiring" }, { value: "deps", label: "Go deps" }, { value: "events", label: "Events" }]} value="wiring" />
      </PageHeader>
      <Page>
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-3">
          <Panel
            title="Wiring"
            meta="who constructs what, in start order"
            actions={<Legend items={[{ label: "app", color: theme.primary }, { label: "handlers", color: theme.text }, { label: "modules", color: theme.info }, { label: "infrastructure", color: theme.muted }]} />}
          >
            <div className="dotgrid overflow-hidden rounded-lg border border-hairline bg-code-bg">
              <svg viewBox="0 0 960 580" className="h-auto w-full">
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0 0L10 5L0 10z" fill={theme.border2} />
                  </marker>
                </defs>
                {edges.map((e, i) => {
                  const a = byId[e.from];
                  const b = byId[e.to];
                  const x1 = a.x + W / 2;
                  const y1 = a.y + H;
                  const x2 = b.x + W / 2;
                  const y2 = b.y;
                  const my = (y1 + y2) / 2;
                  const hot = e.from === sel.id || e.to === sel.id;
                  return (
                    <path
                      key={i}
                      d={`M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}`}
                      fill="none"
                      stroke={hot ? theme.primary : theme.border2}
                      strokeWidth={hot ? 1.6 : 1}
                      className={hot ? "flow" : undefined}
                      markerEnd="url(#arrow)"
                      opacity={hot ? 1 : 0.7}
                    />
                  );
                })}
                {nodes.map((n) => {
                  const hot = n.id === sel.id;
                  return (
                    <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
                      <rect width={W} height={H} rx={8} fill={hot ? theme.primaryShadow : theme.surface} stroke={hot ? theme.primary : theme.border} strokeWidth={hot ? 1.4 : 1} />
                      <rect x={0} y={0} width={3} height={H} rx={1.5} fill={kindColor[n.kind]} />
                      <text x={14} y={H / 2 + 4} fontSize="11.5" fontFamily="var(--font-mono)" fill={theme.text}>
                        {n.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </Panel>
          <div className="flex flex-col gap-3">
            <Panel title="modules/mail" meta="module">
              <KeyList
                rows={[
                  { k: "Package", v: sel.pkg },
                  { k: "Constructed in", v: "internal/app/app.go:74" },
                  { k: "Provides", v: "mail.Sender, mail.AsyncSender" },
                  { k: "Needs", v: "jobs.Client, settings.Store" },
                  { k: "Settings", v: "mail.sender_name, mail.reply_to" },
                  { k: "Jobs", v: "mail.send" },
                ]}
              />
            </Panel>
            <Panel title="Used by" meta={`${inbound.length} modules`}>
              <ul className="grid gap-1.5 font-mono text-[12px]">
                {inbound.map((e) => (
                  <li key={e.from} className="flex items-center gap-2 text-text">
                    <i className="h-1.5 w-1.5 rounded-sm" style={{ background: kindColor[byId[e.from].kind] }} />
                    {byId[e.from].label}
                    {e.via && <span className="ml-auto text-[11px] text-dim">as {e.via}</span>}
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Uses" meta={`${outbound.length} dependencies`}>
              <ul className="grid gap-1.5 font-mono text-[12px]">
                {outbound.map((e) => (
                  <li key={e.to} className="flex items-center gap-2 text-text">
                    <i className="h-1.5 w-1.5 rounded-sm" style={{ background: kindColor[byId[e.to].kind] }} />
                    {byId[e.to].label}
                    {e.via && <span className="ml-auto text-[11px] text-dim">as {e.via}</span>}
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Source" meta="internal/app/app.go">
              <Code>
                <Cmt>// mail sends through jobs so a slow SMTP never blocks a request.</Cmt>
                {"\n"}
                <Key>mailer</Key> := mail.<Str>NewSMTP</Str>(cfg.SMTP, settings)
                {"\n"}
                <Key>sender</Key> := jobs.<Str>AsyncSender</Str>(jobsClient, mailer)
                {"\n"}
                <Key>authSvc</Key> := auth.<Str>New</Str>(pool, sender, audit)
                {"\n"}
                <Key>orgsSvc</Key> := orgs.<Str>New</Str>(pool, sender, audit)
              </Code>
            </Panel>
          </div>
        </div>
      </Page>
    </>
  );
}
