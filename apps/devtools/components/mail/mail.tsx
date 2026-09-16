"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ExternalLink, Paperclip, RefreshCw, Send, Trash2 } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Field, Input } from "@gorbital/dash/components/input";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { fmtBytes, fmtInt } from "@gorbital/dash/lib/format";
import { errorMessage } from "@/lib/api/errors";
import { useCapabilities, useDevMail, useOpsMail, useRemoveSuppression, useSendTestEmail, useSuppressions } from "@/lib/api/queries";
import type { DevMessage, Suppression } from "@/lib/api/types";
import { ago, when } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { Gate } from "@/components/shared/gate";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { ReasonDialog } from "@/components/shared/reason-dialog";

export function Mail() {
  const caps = useCapabilities();
  const project = caps.status.data?.project;
  const hasMail = Boolean(project && (project.mail || project.features.includes("mail")));
  const inbox = useDevMail(caps.console && hasMail);
  const config = useOpsMail(caps.ops && hasMail);
  const suppressions = useSuppressions(caps.ops && hasMail);
  const send = useSendTestEmail();
  const remove = useRemoveSuppression();
  const now = useNow(10_000);
  const [to, setTo] = useState("");
  const [removing, setRemoving] = useState<Suppression | null>(null);

  const webUrl = inbox.data?.web_url || caps.status.data?.links.mail;
  const messages = inbox.data?.messages ?? [];
  const supp = suppressions.data?.pages.flatMap((p) => p.suppressions ?? []) ?? [];

  const sendTest = (e: FormEvent) => {
    e.preventDefault();
    if (!to.trim()) return;
    send.mutate({ to: to.trim() }, { onSuccess: () => setTo("") });
  };

  if (caps.status.data && !hasMail) {
    return (
      <>
        <PageHeader product="devtools" title="Mail" description="the inbox orb dev captures, and how the app sends email" />
        <Page>
          <Empty title="This app doesn't send email" hint="orb add mail wires a provider and Mailpit for development; this page fills in after that." />
        </Page>
      </>
    );
  }

  return (
    <>
      <PageHeader product="devtools" title="Mail" description={inbox.data ? `${fmtInt(inbox.data.total)} captured by Mailpit · ${config.data ? `${config.data.provider} · delivery ${config.data.delivery}` : "/_dev/mail"}` : "the inbox orb dev captures, and how the app sends email"}>
        {webUrl && (
          <a href={webUrl} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-elevated px-2.5 text-[11px] font-medium text-text hover:border-border-2">
            Open Mailpit <ExternalLink size={11} className="text-dim" />
          </a>
        )}
        <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />} onClick={() => void Promise.all([inbox.refetch(), config.refetch(), suppressions.refetch()])} loading={inbox.isFetching}>
          Refresh
        </Button>
      </PageHeader>
      <Page>
        <Gate need="console" loading={<SkeletonLines lines={8} className="p-4" />}>
          <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-3">
            <Panel title="Inbox" meta={inbox.data ? `newest ${messages.length} of ${fmtInt(inbox.data.total)} · every 10 s` : "/_dev/mail"} flush>
              {inbox.error && !inbox.data ? (
                <div className="p-3">
                  <ProblemPanel error={inbox.error} scope="dev" console={caps.consoleDeclared} meta="GET /_dev/mail" onRetry={() => void inbox.refetch()} retrying={inbox.isFetching} />
                </div>
              ) : inbox.isPending ? (
                <SkeletonLines lines={6} className="p-4" />
              ) : messages.length === 0 ? (
                <Empty title="Nothing captured yet" hint="Every email the app sends on the bench lands in Mailpit; send a test one from the right." />
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
            <div className="flex flex-col gap-3">
              <Panel title="Send a test email" meta="POST /ops/mail/test">
                {!caps.ops ? (
                  <p className="text-[12px] text-dim">Needs the ops API (Full preset).</p>
                ) : (
                  <form onSubmit={sendTest} className="grid gap-2">
                    <Field label="To" htmlFor="test-to" hint={config.data?.delivery === "mailpit" ? "Delivered to Mailpit, never outside the bench. 5 an hour per operator." : "Delivered by the provider; 5 an hour per operator."}>
                      <Input id="test-to" type="email" mono value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" required />
                    </Field>
                    <div>
                      <Button type="submit" size="sm" kind="primary" icon={<Send size={11} />} loading={send.isPending} disabled={!to.trim()}>
                        Send
                      </Button>
                    </div>
                  </form>
                )}
              </Panel>
              <Panel title="Delivery" meta="/ops/mail">
                {!caps.ops ? (
                  <p className="text-[12px] text-dim">Needs the ops API (Full preset).</p>
                ) : config.error && !config.data ? (
                  <p className="font-mono text-[11px] text-danger">{errorMessage(config.error)}</p>
                ) : !config.data ? (
                  <SkeletonLines lines={5} />
                ) : (
                  <div className="grid gap-3">
                    <div className="flex flex-wrap gap-1">
                      <Badge tone="info">{config.data.provider}</Badge>
                      <Badge tone={config.data.delivery === "mailpit" ? "accent" : "warn"}>{config.data.delivery === "mailpit" ? "delivery: mailpit" : "delivery: provider (real email)"}</Badge>
                    </div>
                    <KeyList
                      rows={[
                        { k: "From", v: `${config.data.from_name} <${config.data.from_email}>` },
                        { k: "Reply to", v: config.data.reply_to || "—" },
                        ...Object.entries(config.data.details).map(([k, v]) => ({ k, v })),
                      ]}
                    />
                    <Link href="/settings?group=mail" className="text-[12px] text-primary hover:underline">
                      Change the sender in Settings
                    </Link>
                  </div>
                )}
              </Panel>
              <Panel title="Suppressions" meta={suppressions.data ? `${supp.length} address${supp.length === 1 ? "" : "es"}` : "/ops/mail/suppressions"} flush>
                {!caps.ops ? (
                  <p className="p-4 text-[12px] text-dim">Needs the ops API (Full preset).</p>
                ) : suppressions.error && !suppressions.data ? (
                  <p className="p-4 font-mono text-[11px] text-danger">{errorMessage(suppressions.error)}</p>
                ) : suppressions.isPending ? (
                  <SkeletonLines lines={3} className="p-4" />
                ) : supp.length === 0 ? (
                  <Empty title="No suppressed addresses" hint="Hard bounces and complaints from the provider's webhook land here." />
                ) : (
                  <ul>
                    {supp.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 border-t border-hairline px-4 py-2.5 first:border-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 font-mono text-[12px] text-text">
                            <span className="truncate">{s.email}</span>
                            <Badge tone={s.reason === "complaint" ? "danger" : "warn"}>{s.reason}</Badge>
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-dim">
                            {s.source}
                            {s.detail ? ` · ${s.detail}` : ""} · {when(s.updated_at)}
                          </div>
                        </div>
                        <Button size="sm" kind="ghost" icon={<Trash2 size={11} />} onClick={() => setRemoving(s)} aria-label={`Remove ${s.email}`}>
                          Remove
                        </Button>
                      </li>
                    ))}
                    {suppressions.hasNextPage && (
                      <li className="flex justify-center border-t border-hairline p-2">
                        <Button size="sm" kind="ghost" onClick={() => void suppressions.fetchNextPage()} loading={suppressions.isFetchingNextPage}>
                          Load more
                        </Button>
                      </li>
                    )}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        </Gate>
      </Page>
      <ReasonDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Let ${removing?.email} receive email again?`}
        description="The address comes off the suppression list; the reason is recorded in the audit log without the address."
        confirmLabel="Remove"
        danger
        loading={remove.isPending}
        onConfirm={(reason) => removing && remove.mutate({ id: removing.id, body: { reason } }, { onSettled: () => setRemoving(null) })}
      />
    </>
  );
}
