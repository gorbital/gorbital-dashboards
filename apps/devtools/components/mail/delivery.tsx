"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Send, Trash2 } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Field, Input } from "@gorbital/dash/components/input";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { errorMessage } from "@/lib/api/errors";
import { useCapabilities, useOpsMail, useRemoveSuppression, useSendTestEmail, useSuppressions } from "@/lib/api/queries";
import type { Suppression } from "@/lib/api/types";
import { when } from "@/lib/time";
import { Gate } from "@/components/shared/gate";
import { ReasonDialog } from "@/components/shared/reason-dialog";

/** The Phase 1 sections on the ops API: how the app sends email, a test email, and the suppression list. */
export function Delivery() {
  const caps = useCapabilities();
  const config = useOpsMail(caps.ops);
  const suppressions = useSuppressions(caps.ops);
  const send = useSendTestEmail();
  const remove = useRemoveSuppression();
  const [to, setTo] = useState("");
  const [removing, setRemoving] = useState<Suppression | null>(null);
  const supp = suppressions.data?.pages.flatMap((p) => p.suppressions ?? []) ?? [];

  const sendTest = (e: FormEvent) => {
    e.preventDefault();
    if (!to.trim()) return;
    send.mutate({ to: to.trim() }, { onSuccess: () => setTo("") });
  };

  const deliveryTone = config.data?.delivery === "provider" ? "warn" : "accent";
  const deliveryLabel = config.data ? (config.data.delivery === "provider" ? "delivery: provider (real email)" : config.data.delivery === "mailpit" ? "delivery: mailpit" : "delivery: devmail (this inbox)") : "";

  return (
    <Gate need="ops" loading={<SkeletonLines lines={8} className="p-4" />}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <div className="flex flex-col gap-3">
          <Panel title="Delivery" meta="/ops/mail">
            {config.error && !config.data ? (
              <p className="font-mono text-[11px] text-danger">{errorMessage(config.error)}</p>
            ) : !config.data ? (
              <SkeletonLines lines={5} />
            ) : (
              <div className="grid gap-3">
                <div className="flex flex-wrap gap-1">
                  <Badge tone="info">{config.data.provider}</Badge>
                  <Badge tone={deliveryTone}>{deliveryLabel}</Badge>
                </div>
                <KeyList
                  rows={[
                    { k: "From", v: `${config.data.from_name} <${config.data.from_email}>` },
                    { k: "Reply to", v: config.data.reply_to || "—" },
                    ...Object.entries(config.data.details).map(([k, v]) => ({ k, v })),
                  ]}
                />
                <p className="text-[12px] text-muted">
                  {config.data.delivery === "provider" ? "MAIL_DELIVERY=provider: the app emails real addresses through the provider. Set it to devmail in Environment to keep messages on the bench." : "Every message goes to the development inbox, whatever the provider; nobody real is emailed. MAIL_DELIVERY in Environment switches it."}
                </p>
                <div className="flex gap-3">
                  <Link href="/settings?group=mail" className="text-[12px] text-primary hover:underline">
                    Change the sender in Settings
                  </Link>
                  <Link href="/environment?q=MAIL" className="text-[12px] text-primary hover:underline">
                    MAIL_DELIVERY in Environment
                  </Link>
                </div>
              </div>
            )}
          </Panel>
          <Panel title="Send a test email" meta="POST /ops/mail/test">
            <form onSubmit={sendTest} className="grid gap-2">
              <Field label="To" htmlFor="test-to" hint={config.data?.delivery === "provider" ? "Delivered by the provider; 5 an hour per operator." : "Lands in the inbox, never outside the bench. 5 an hour per operator."}>
                <Input id="test-to" type="email" mono value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" required />
              </Field>
              <div>
                <Button type="submit" size="sm" kind="primary" icon={<Send size={11} />} loading={send.isPending} disabled={!to.trim()}>
                  Send
                </Button>
              </div>
            </form>
          </Panel>
        </div>
        <Panel title="Suppressions" meta={suppressions.data ? `${supp.length} address${supp.length === 1 ? "" : "es"}` : "/ops/mail/suppressions"} flush>
          {suppressions.error && !suppressions.data ? (
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
    </Gate>
  );
}
