"use client";

import { ExternalLink, Paperclip } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { fmtBytes, fmtInt } from "@gorbital/dash/lib/format";
import { useCapabilities, useDevMail } from "@/lib/api/queries";
import type { DevMessage } from "@/lib/api/types";
import { ago } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { ProblemPanel } from "@/components/shared/problem-panel";

/**
 * The Phase 1 inbox: Mailpit's newest messages through the console's
 * `/_dev/mail`, each linking to Mailpit's own view. Shown when this orb dev
 * runs no catcher (`MAIL_DELIVERY=mailpit`) but the app still proxies Mailpit.
 */
export function MailpitInbox() {
  const caps = useCapabilities();
  const inbox = useDevMail(caps.console);
  const now = useNow(10_000);
  const webUrl = inbox.data?.web_url || caps.status.data?.links.mail;
  const messages = inbox.data?.messages ?? [];
  return (
    <Panel
      title="Mailpit"
      meta={inbox.data ? `newest ${messages.length} of ${fmtInt(inbox.data.total)} · every 10 s · MAIL_DELIVERY=mailpit` : "/_dev/mail"}
      flush
      actions={
        webUrl && (
          <a href={webUrl} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-elevated px-2.5 text-[11px] font-medium text-text hover:border-border-2">
            Open Mailpit <ExternalLink size={11} className="text-dim" />
          </a>
        )
      }
    >
      <div className="border-b border-hairline px-4 pb-3 text-[12px] text-muted">This orb dev runs no mail catcher, so the app sends to Mailpit. Set MAIL_DELIVERY=devmail (the default) and restart orb dev to read messages here, with codes, links and source.</div>
      {inbox.error && !inbox.data ? (
        <div className="p-3">
          <ProblemPanel error={inbox.error} scope="dev" console={caps.consoleDeclared} meta="GET /_dev/mail" onRetry={() => void inbox.refetch()} retrying={inbox.isFetching} />
        </div>
      ) : inbox.isPending ? (
        <SkeletonLines lines={6} className="p-4" />
      ) : messages.length === 0 ? (
        <Empty title="Nothing captured yet" hint="Every email the app sends on the bench lands in Mailpit; send a test one from the Delivery tab." />
      ) : (
        <ul>
          {messages.map((m: DevMessage) => (
            <li key={m.id}>
              <a href={webUrl ? `${webUrl.replace(/\/$/, "")}/view/${m.id}` : undefined} target="_blank" rel="noreferrer" className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-start gap-x-3 border-t border-hairline px-4 py-2.5 first:border-0 hover:bg-elevated/40">
                <span className="pt-1.5">{!m.read && <Dot tone="accent" />}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className={`truncate ${m.read ? "text-muted" : "font-medium text-text"}`}>{m.subject || "(no subject)"}</span>
                    {m.attachments > 0 && (
                      <Badge tone="muted">
                        <Paperclip size={9} /> {m.attachments}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-dim">
                    {m.from.name ? `${m.from.name} <${m.from.address}>` : m.from.address} → {m.to.map((t) => t.address).join(", ")}
                  </div>
                  {m.snippet && <div className="mt-0.5 truncate text-[11.5px] text-muted">{m.snippet}</div>}
                </div>
                <div className="text-right font-mono text-[11px] text-dim">
                  <div className="tnum">{ago(m.created, now)}</div>
                  <div className="text-faint">{fmtBytes(m.size)}</div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
