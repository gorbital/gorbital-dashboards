"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, FileCode2, Play } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code, Cmt } from "@gorbital/dash/components/code";
import { Dialog } from "@gorbital/dash/components/dialog";
import { Checkbox, Field, Input } from "@gorbital/dash/components/input";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { ApiError } from "@/lib/api/client";
import { describeError, useDdlApply, useDdlPlan, type Change, type DdlResponse } from "@/lib/api/schema";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The change to plan; the dialog plans it again whenever it changes while open. */
  change: Change | null;
  /** The migration's name; the plan's summary when empty. */
  name?: string;
  title?: string;
  /** Red Apply button, for drops. */
  danger?: boolean;
  /** Called after the migration was written and (when orb dev reported back) applied. */
  onApplied?: (res: DdlResponse) => void;
};

/**
 * Every schema change goes through here: `POST db/ddl/plan` shows the Up
 * and Down SQL, the notes, whether it is irreversible and the file it
 * becomes; Apply sends the same change to `db/ddl/apply`, which writes the
 * file and queues `migrate`. The hook then polls `db/migrations` and
 * refetches the catalog. 409 `plan_conflict` means the working tree is
 * dirty: tick "allow uncommitted changes". 403 `system_table` and 422
 * `invalid_input` show the backend's detail.
 */
export function PlanDialog({ open, onOpenChange, change, name: initialName, title, danger, onApplied }: Props) {
  const plan = useDdlPlan();
  const apply = useDdlApply();
  const [name, setName] = useState(initialName ?? "");
  const [allowDirty, setAllowDirty] = useState(false);

  useEffect(() => {
    if (open) setName(initialName ?? "");
  }, [open, initialName]);

  // Plan when opened or when the change is edited behind the dialog.
  const changeKey = JSON.stringify(change);
  useEffect(() => {
    if (!open || !change) return;
    plan.mutate({ change, name: initialName });
    // The mutation object is stable enough; the key is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, changeKey]);

  useEffect(() => {
    if (!open) {
      plan.reset();
      apply.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const res = plan.data;
  const busy = plan.isPending || apply.isPending;
  const error = apply.error ?? plan.error;
  const conflict = error instanceof ApiError && error.code === "plan_conflict";

  const submit = () => {
    if (!change) return;
    apply.mutate(
      { change, name: name.trim() || undefined, allow_dirty: allowDirty },
      {
        onSuccess: (r) => {
          onOpenChange(false);
          onApplied?.(r);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={title ?? res?.plan.summary ?? "Plan the change"}
      description="The change becomes a migration file in db/migrations, then orb dev applies it. Nothing changes until you apply."
      size="lg"
      footer={
        <>
          <Button kind="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button kind={danger ? "danger" : "primary"} size="sm" icon={<Play size={11} />} onClick={submit} disabled={!res || plan.isPending} loading={apply.isPending}>
            {apply.isPending ? "Applying…" : "Write and apply"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 pb-1">
        {plan.isPending && !res ? (
          <SkeletonLines lines={5} />
        ) : res ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="accent">{res.plan.summary}</Badge>
              {res.plan.irreversible && (
                <Badge tone="danger">
                  <AlertTriangle size={10} /> irreversible
                </Badge>
              )}
              {res.plan.no_transaction && <Badge tone="warn">no transaction</Badge>}
              {res.plan.down.length === 0 && !res.plan.irreversible && <Badge tone="muted">no Down</Badge>}
            </div>
            {res.plan.notes?.length ? (
              <ul className="grid gap-1 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-[11.5px] text-warn">
                {res.plan.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
            <Section label="Up">
              <Code className="max-h-[220px] overflow-y-auto whitespace-pre-wrap break-words">{res.plan.up.join("\n")}</Code>
            </Section>
            <Section label="Down">
              <Code className="max-h-[160px] overflow-y-auto whitespace-pre-wrap break-words">{res.plan.down.length ? res.plan.down.join("\n") : <Cmt>-- nothing: this change can&apos;t be undone by a migration</Cmt>}</Code>
            </Section>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
              <Field label="Migration name" htmlFor="plan-name" hint={<span className="inline-flex items-center gap-1 font-mono"><FileCode2 size={10} /> {res.file.path}</span>}>
                <Input id="plan-name" mono value={name} onChange={(e) => setName(e.target.value)} placeholder={slug(res.plan.summary)} onBlur={() => change && plan.mutate({ change, name: name.trim() || undefined })} />
              </Field>
              <Field label="git" htmlFor="plan-dirty" inline className="pb-5">
                <Checkbox id="plan-dirty" checked={allowDirty} onCheckedChange={(c) => setAllowDirty(c === true)} />
                <span className="text-[12px]">allow uncommitted changes</span>
              </Field>
            </div>
          </>
        ) : null}
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-[11.5px] text-danger">
            {error instanceof ApiError ? `${error.status} ${error.code}` : "error"} · {error instanceof ApiError ? error.detail || error.title : describeError(error)}
            {conflict && !allowDirty && <div className="mt-1 text-warn">Tick &quot;allow uncommitted changes&quot; to write the migration into a dirty working tree.</div>}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-dim">{label}</span>
      {children}
    </div>
  );
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
