import { Page, PageHeader } from "@apistock/dash/components/page";
import { Pill } from "@apistock/dash/components/pill";
import { Tile, TileGrid } from "@apistock/dash/components/tile";
import { Panel, KeyList } from "@apistock/dash/components/panel";
import { Badge } from "@apistock/dash/components/badge";
import { Table } from "@apistock/dash/components/table";
import { Split } from "@apistock/dash/components/progress";
import { theme } from "@apistock/dash/theme";
import { fmtAgo, fmtTime } from "@apistock/dash/lib/format";
import { mails, NOW, type Mail } from "@/lib/mock";

const tone = { delivered: "ok", sent: "muted", bounced: "warn", queued: "info", failed: "danger" } as const;

export default function MailPage() {
  const sel = mails[1];
  const counts = mails.reduce<Record<string, number>>((a, m) => ((a[m.state] = (a[m.state] ?? 0) + 1), a), {});
  return (
    <>
      <PageHeader product="observe" title="Mail" searchHint="Search recipient, subject, template">
        <Pill dot="ok">Last 24 hours</Pill>
        <Pill>All templates</Pill>
      </PageHeader>
      <Page>
        <TileGrid>
          <Tile label="Sent" value="2,814" delta="+3.0%" hero />
          <Tile label="Delivered" value="99.1" unit="%" delta="+0.2" />
          <Tile label="Bounced" value="9" delta="2 hard" deltaTone="bad" />
          <Tile label="Provider" value="SMTP" unit="mail.acme.dev" delta="1 timeout" deltaTone="bad" />
        </TileGrid>
        <div className="panel flex items-center gap-4 px-4 py-3 text-[11px]">
          <span className="font-mono uppercase tracking-wider text-dim">By state</span>
          <div className="flex-1">
            <Split parts={[{ value: counts.delivered ?? 0, color: theme.ok }, { value: counts.sent ?? 0, color: theme.muted }, { value: counts.queued ?? 0, color: theme.info }, { value: counts.bounced ?? 0, color: theme.warn }, { value: counts.failed ?? 0, color: theme.danger }]} height={8} />
          </div>
          {Object.entries(counts).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5 text-muted">
              <Badge tone={tone[k as keyof typeof tone]}>{k}</Badge> <span className="font-mono text-dim tnum">{v}</span>
            </span>
          ))}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-3">
          <Panel title="Messages" flush>
            <Table<Mail>
              rows={mails}
              rowKey={(m) => m.id}
              selected={sel.id}
              columns={[
                { key: "at", header: "Time", width: "90px", cell: (m) => <span className="font-mono text-dim tnum">{fmtTime(m.at)}</span> },
                { key: "s", header: "State", width: "96px", cell: (m) => <Badge tone={tone[m.state]}>{m.state}</Badge> },
                { key: "to", header: "To", width: "180px", cell: (m) => <span className="font-mono text-text">{m.to}</span> },
                { key: "subj", header: "Subject", cell: (m) => <span className="text-muted">{m.subject}</span> },
                { key: "t", header: "Template", width: "130px", cell: (m) => <span className="font-mono text-dim">{m.template}</span> },
                { key: "o", header: "Opens", width: "60px", align: "right", cell: (m) => <span className="font-mono text-dim tnum">{m.opens || "–"}</span> },
                { key: "ago", header: "", width: "70px", align: "right", cell: (m) => <span className="text-dim">{fmtAgo(m.at, NOW)}</span> },
              ]}
            />
          </Panel>
          <div className="flex flex-col gap-3">
            <Panel title="Message" meta={sel.id}>
              <KeyList
                rows={[
                  { k: "To", v: sel.to },
                  { k: "From", v: "acme <no-reply@acme.dev>" },
                  { k: "Template", v: sel.template },
                  { k: "Job", v: sel.job },
                  { k: "Idempotency", v: `${sel.job}:1` },
                  { k: "State", v: <Badge tone={tone[sel.state]}>{sel.state}</Badge> },
                ]}
              />
              <div className="mt-3 rounded-lg border border-danger/25 bg-danger/8 p-3 font-mono text-[11.5px] text-danger">
                dial tcp 10.0.3.12:587: i/o timeout
                <div className="mt-1 text-[10.5px] text-dim">attempt 3 of 5 · next retry in 4 min · grouped with 47 events</div>
              </div>
            </Panel>
            <Panel title="Preview" meta="rendered from template" flush>
              <div className="m-4 mt-2 overflow-hidden rounded-lg border border-hairline bg-[#fbfaf6] p-5 text-[#14140f]">
                <div className="mb-4 flex items-center gap-2">
                  <svg viewBox="0 0 16.6 14" className="h-3.5 w-auto"><rect x="2.6" y="0" width="14" height="3" fill="#d8ff3e" /><rect x="0" y="3.6667" width="14" height="3" fill="#14140f" /><rect x="0" y="7.3333" width="14" height="3" fill="#57564f" /><rect x="0" y="11" width="14" height="3" fill="#c9c6bc" /></svg>
                  <b className="text-[13px] tracking-tight">acme</b>
                </div>
                <h3 className="text-[15px] font-semibold leading-snug">New sign-in to your acme account</h3>
                <p className="mt-2 text-[12px] leading-relaxed text-[#57564f]">A new sign-in from Safari on macOS in Amsterdam, NL just now. If this was you, nothing else to do.</p>
                <span className="mt-3 inline-block rounded-md bg-[#14140f] px-3 py-1.5 text-[11px] font-medium text-[#fbfaf6]">Review sessions</span>
              </div>
            </Panel>
          </div>
        </div>
      </Page>
    </>
  );
}
