import { Trash2, Code2, Monitor } from "lucide-react";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Segmented } from "@gorbital/dash/components/pill";
import { Panel, KeyList } from "@gorbital/dash/components/panel";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { fmtAgo } from "@gorbital/dash/lib/format";
import { outbox, NOW } from "@/lib/mock";

export default function MailPage() {
  const sel = outbox[0];
  return (
    <>
      <PageHeader product="devtools" title="Mail" searchHint="Jump to route, module, setting">
        <Badge tone="muted">captured by orb dev · nothing leaves the bench</Badge>
        <Button size="sm" kind="ghost" icon={<Trash2 size={11} />} className="ml-1">
          Clear outbox
        </Button>
      </PageHeader>
      <div className="grid flex-1 grid-cols-[360px_minmax(0,1fr)]">
        <aside className="border-r border-hairline">
          <div className="flex items-center gap-2 px-4 py-3 text-[11px] font-mono uppercase tracking-wider text-dim">
            Outbox <span className="text-muted tnum">{outbox.length}</span>
          </div>
          <ul className="stagger">
            {outbox.map((m) => (
              <li key={m.id} className={`cursor-pointer border-t border-hairline px-4 py-3 ${m.id === sel.id ? "bg-elevated/70" : "hover:bg-elevated/40"}`}>
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-[12px] text-text">{m.to}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-dim">{fmtAgo(m.at, NOW)}</span>
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-muted">{m.subject}</div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge tone="muted">{m.template}</Badge>
                  <span className="font-mono text-[10.5px] text-dim">{m.size}</span>
                </div>
              </li>
            ))}
          </ul>
        </aside>
        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-3">
            <h2 className="text-[16px] font-semibold tracking-tight">{sel.subject}</h2>
            <span className="ml-auto">
              <Segmented options={[{ value: "html", label: "HTML" }, { value: "text", label: "Text" }, { value: "source", label: "Source" }]} value="html" />
            </span>
          </div>
          <div className="panel p-4">
            <KeyList
              rows={[
                { k: "To", v: sel.to },
                { k: "From", v: "acme-api (dev) <no-reply@localhost>" },
                { k: "Template", v: `internal/mail/templates/${sel.template}.html` },
                { k: "Job", v: "job_b02c · idempotency job_b02c:1" },
                { k: "Enqueued by", v: "POST /v1/orgs/acme/invites · req_71c0aa2d3e" },
              ]}
            />
          </div>
          <div className="panel flex-1 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-hairline px-4 py-2 text-[11px] text-dim">
              <Monitor size={12} /> rendered at 600px
              <span className="ml-auto flex items-center gap-1">
                <Code2 size={12} /> 4.1 KB
              </span>
            </div>
            <div className="bg-[#efede6] p-8">
              <div className="mx-auto max-w-[520px] rounded-xl bg-[#fbfaf6] p-8 text-[#14140f] shadow-sm">
                <div className="mb-6 flex items-center gap-2">
                  <svg viewBox="0 0 120 120" className="h-4 w-auto" aria-hidden="true"><circle cx="60" cy="60" r="42" fill="none" stroke="#14140f" strokeWidth="14" /><rect x="52" y="2" width="16" height="116" fill="#fbfaf6" transform="rotate(34 60 60)" /><rect x="54" y="6" width="12" height="108" fill="#C6F24A" transform="rotate(34 60 60)" /></svg>
                  <b className="text-[14px] tracking-tight">acme-api</b>
                </div>
                <h3 className="text-[20px] font-semibold leading-tight tracking-tight">You&apos;re invited to acme</h3>
                <p className="mt-3 text-[13px] leading-relaxed text-[#57564f]">Muhammad Qazi invited you to join <b className="text-[#14140f]">acme</b> as an editor. The invitation is valid for 7 days.</p>
                <span className="mt-5 inline-block rounded-lg bg-[#14140f] px-4 py-2 text-[13px] font-medium text-[#fbfaf6]">Accept invitation</span>
                <p className="mt-6 border-t border-[#c9c6bc] pt-4 text-[11px] text-[#57564f]">If you weren&apos;t expecting this, ignore it. Nobody can join without this link.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
