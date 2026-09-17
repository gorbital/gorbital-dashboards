"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox as InboxIcon, Paperclip, Search, Trash2, X } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { ConfirmDialog } from "@gorbital/dash/components/dialog";
import { Input } from "@gorbital/dash/components/input";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import { fmtInt } from "@gorbital/dash/lib/format";
import { isNoMailCatcher, useClearMail, useInbox, useMailStream, type MailSummary } from "@/lib/api/mail";
import { useCapabilities } from "@/lib/api/queries";
import { displayAddress, displayAddresses, formatCode, formatSize, subjectOf } from "@/lib/mail/format";
import { ago } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { MailpitInbox } from "./mailpit-inbox";
import { MessageDetail } from "./message-detail";

type Props = {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

/** The inbox orb dev caught: search, the list with live arrivals, and the selected message's detail beside it. */
export function Inbox({ selectedId, onSelect }: Props) {
  const caps = useCapabilities();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const inbox = useInbox(query, Boolean(caps.status.data));
  const noCatcher = isNoMailCatcher(inbox.error);
  const stream = useMailStream(Boolean(inbox.data) && !noCatcher);
  const clear = useClearMail();
  const [clearing, setClearing] = useState(false);
  const now = useNow(10_000);

  // Search as you type, a beat after the last key.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const onDeleted = useCallback(() => onSelect(null), [onSelect]);

  if (noCatcher) {
    return <NoCatcher console={caps.console} />;
  }

  const messages = inbox.data?.messages ?? [];
  const selected = selectedId ? messages.find((m) => m.id === selectedId) : undefined;

  return (
    <>
      <div className="grid min-h-[520px] grid-cols-[minmax(320px,2fr)_minmax(0,3fr)] gap-3">
        <Panel
          flush
          title="Inbox"
          meta={inbox.data ? `${fmtInt(inbox.data.count)} caught${query ? ` · ${fmtInt(inbox.data.total)} match` : ""} · ${stream.connection.state === "open" ? "live" : "every 15 s"}` : "/_portal/api/mail"}
          actions={
            inbox.data && inbox.data.count > 0 ? (
              <Button size="sm" kind="ghost" icon={<Trash2 size={11} />} onClick={() => setClearing(true)} loading={clear.isPending}>
                Clear all
              </Button>
            ) : undefined
          }
        >
          <div className="relative px-3 pb-2">
            <Search size={12} className="pointer-events-none absolute left-5 top-1/2 -translate-y-[calc(50%+4px)] text-dim" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search subject, address, code…" className="pl-7 pr-7" aria-label="Search the inbox" />
            {q && (
              <button type="button" onClick={() => setQ("")} className="absolute right-5 top-1/2 grid h-5 w-5 -translate-y-[calc(50%+4px)] place-items-center rounded text-dim hover:text-text" aria-label="Clear the search">
                <X size={11} />
              </button>
            )}
          </div>
          {inbox.error && !inbox.data ? (
            <div className="p-3">
              <ProblemPanel error={inbox.error} scope="portal" meta="GET /_portal/api/mail" onRetry={() => void inbox.refetch()} retrying={inbox.isFetching} />
            </div>
          ) : inbox.isPending ? (
            <SkeletonLines lines={8} className="p-4" />
          ) : messages.length === 0 ? (
            query ? (
              <Empty title="Nothing matches" hint="The search looks at subjects, addresses, snippets and codes." />
            ) : (
              <Empty title="Nothing caught yet" hint={`Every email the app sends lands here while MAIL_DELIVERY is devmail (the default). The catcher listens on ${inbox.data?.smtp_addr ?? "127.0.0.1:1025"}; send a preview or register a user to see one.`} />
            )
          ) : (
            <ul className="max-h-[calc(100vh-300px)] overflow-y-auto border-t border-hairline">
              {messages.map((m) => (
                <MessageRow key={m.id} m={m} now={now} selected={m.id === selectedId} onSelect={() => onSelect(m.id === selectedId ? null : m.id)} />
              ))}
              {inbox.data && inbox.data.total > messages.length && <li className="px-4 py-2 text-center font-mono text-[11px] text-dim">newest {messages.length} of {fmtInt(inbox.data.total)}; search to find older ones</li>}
            </ul>
          )}
        </Panel>
        <div className="min-w-0">
          {selectedId ? (
            <MessageDetail id={selectedId} summary={selected} onDeleted={onDeleted} onClose={() => onSelect(null)} />
          ) : (
            <Panel className="h-full">
              <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-2 text-center">
                <InboxIcon size={22} className="text-faint" />
                <div className="text-[13px] font-medium text-muted">Select a message</div>
                <p className="max-w-sm text-[12px] text-dim">HTML, text, source and headers; codes and links with copy buttons; attachments and the envelope.</p>
              </div>
            </Panel>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        title="Clear the inbox?"
        description={`Every message orb dev caught (${fmtInt(inbox.data?.count ?? 0)}) is deleted from .orb/portal/mail. The app keeps sending; new ones land here.`}
        confirmLabel="Clear all"
        danger
        loading={clear.isPending}
        onConfirm={() =>
          clear.mutate(undefined, {
            onSettled: () => {
              setClearing(false);
              onSelect(null);
            },
          })
        }
      />
    </>
  );
}

function MessageRow({ m, now, selected, onSelect }: { m: MailSummary; now: number; selected: boolean; onSelect: () => void }) {
  return (
    <li>
      <button type="button" onClick={onSelect} aria-current={selected || undefined} className={`grid w-full grid-cols-[10px_minmax(0,1fr)_auto] items-start gap-x-3 border-b border-hairline px-4 py-2.5 text-left transition-colors hover:bg-elevated/40 ${selected ? "bg-elevated/70" : ""}`}>
        <span className="pt-1.5">{!m.read && <Dot tone="accent" />}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12px]">
            <span className={`truncate ${m.read ? "text-muted" : "font-semibold text-text"}`}>{subjectOf(m)}</span>
            {m.codes.slice(0, 2).map((c) => (
              <Badge key={c} tone="accent" className="shrink-0">
                {formatCode(c)}
              </Badge>
            ))}
            {m.codes.length > 2 && (
              <Badge tone="accent" className="shrink-0">
                +{m.codes.length - 2}
              </Badge>
            )}
            {m.attachments > 0 && (
              <Badge tone="muted" className="shrink-0">
                <Paperclip size={9} /> {m.attachments}
              </Badge>
            )}
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-dim">
            {displayAddress(m.from)} → {displayAddresses(m.to)}
          </div>
          {m.snippet && <div className="mt-0.5 truncate text-[11.5px] text-muted">{m.snippet}</div>}
        </div>
        <div className="text-right font-mono text-[11px] text-dim">
          <Tooltip content={new Date(m.time).toLocaleString()}>
            <div className="tnum">{ago(m.time, now)}</div>
          </Tooltip>
          <div className="text-faint">{formatSize(m.size)}</div>
        </div>
      </button>
    </li>
  );
}

/** What the tab shows when this orb dev runs no catcher: Mailpit's inbox when the app proxies one, else how to get the catcher. */
function NoCatcher({ console }: { console: boolean }) {
  if (console) return <MailpitInbox />;
  return (
    <Panel>
      <Empty title="No mail catcher in this orb dev" hint="The app sends email to Mailpit or a provider. Set MAIL_DELIVERY=devmail in .env (or leave it empty) and restart orb dev: it starts an SMTP catcher and every message lands here." />
    </Panel>
  );
}
