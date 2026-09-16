"use client";

import { useEffect, useState } from "react";
import { Pencil, RotateCcw } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Field, Input, Switch, Textarea } from "@gorbital/dash/components/input";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Sheet } from "@gorbital/dash/components/sheet";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Table } from "@gorbital/dash/components/table";
import { toast } from "@gorbital/dash/components/toast";
import { errorMessage, isVersionConflict, needsReason } from "@/lib/api/errors";
import { ApiError } from "@/lib/api/client";
import { useFlagHistory, useFlags, useResetFlag, useSetFlag, type OpsFlag } from "@/lib/api/flags";
import { useCapabilities } from "@/lib/api/queries";
import { describeFlagState, formFromState, sameState, stateFromForm, targetCount, type FlagForm } from "@/lib/flags/state";
import { ago, when } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { ReasonDialog } from "@/components/shared/reason-dialog";

type Props = {
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  show: "all" | "modified";
};

/** Feature flags from `/ops/flags` (ADR-0057): enabled, default, rollout percentage and targets, edited with a reason and the version read, with history. */
export function Flags({ selectedKey, onSelect, show }: Props) {
  const caps = useCapabilities();
  const flags = useFlags(caps.ops);
  const reset = useResetFlag();
  const [resetting, setResetting] = useState<OpsFlag | null>(null);
  const all = flags.data ?? [];
  const shown = show === "modified" ? all.filter((f) => f.modified) : all;
  const selected = all.find((f) => f.key === selectedKey);

  if (flags.error && !flags.data) {
    return <ProblemPanel error={flags.error} scope="ops" console={caps.consoleDeclared} meta="GET /ops/flags" onRetry={() => void flags.refetch()} retrying={flags.isFetching} />;
  }
  return (
    <>
      <Panel flush>
        <Table<OpsFlag>
          rows={shown}
          rowKey={(f) => f.key}
          loading={flags.isPending}
          dense
          selected={selectedKey ?? undefined}
          onRowClick={(f) => onSelect(f.key)}
          columns={[
            {
              key: "k",
              header: "Flag",
              cell: (f) => (
                <div className="min-w-0 max-w-[440px]">
                  <div className="flex items-center gap-2 font-mono text-[12px] text-text">
                    <Dot tone={f.invalid_stored_value ? "danger" : f.state.enabled ? "ok" : "muted"} />
                    <span className="truncate">{f.key}</span>
                    <span className="font-mono text-[10.5px] text-faint tnum">v{f.version}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-dim">{f.description}</div>
                </div>
              ),
            },
            { key: "g", header: "Group", width: "110px", cell: (f) => <span className="font-mono text-dim">{f.group}</span> },
            {
              key: "s",
              header: "State · declared",
              width: "240px",
              cell: (f) => (
                <div className="min-w-0 max-w-[240px]">
                  <div className={`truncate font-mono ${f.modified ? "text-primary" : "text-muted"}`}>{describeFlagState(f.state)}</div>
                  {f.modified && <div className="truncate font-mono text-[10.5px] text-dim">declared {describeFlagState(f.declared_state)}</div>}
                </div>
              ),
            },
            {
              key: "b",
              header: "",
              width: "1%",
              cell: (f) => (
                <span className="flex flex-nowrap gap-1">
                  {f.modified && <Badge tone="accent">modified</Badge>}
                  {f.client && <Badge tone="info">client</Badge>}
                  {f.invalid_stored_value && <Badge tone="danger">invalid</Badge>}
                </span>
              ),
            },
            {
              key: "a",
              header: "",
              width: "1%",
              align: "right",
              cell: (f) => (
                <span className="flex flex-nowrap justify-end gap-0.5">
                  <Button
                    size="sm"
                    kind="ghost"
                    className="px-1.5"
                    aria-label={`Edit ${f.key}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(f.key);
                    }}
                  >
                    <Pencil size={11} />
                  </Button>
                  {f.modified && (
                    <Button
                      size="sm"
                      kind="ghost"
                      className="px-1.5"
                      aria-label={`Reset ${f.key}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setResetting(f);
                      }}
                    >
                      <RotateCcw size={11} />
                    </Button>
                  )}
                </span>
              ),
            },
          ]}
          empty={<Empty title="No feature flags" hint={all.length === 0 ? "The app declares none; declare them in code and they show here." : "Nothing differs from what the code declares."} />}
        />
      </Panel>
      <FlagSheet flag={selected} open={Boolean(selectedKey)} onClose={() => onSelect(null)} enabled={caps.ops} onReset={() => selected && setResetting(selected)} onRefetch={() => void flags.refetch()} />
      <ReasonDialog
        open={Boolean(resetting)}
        onOpenChange={(o) => !o && setResetting(null)}
        title={`Reset ${resetting?.key} to its declared state?`}
        description={resetting ? `Back to “${describeFlagState(resetting.declared_state)}”, as declared in code. Applied on every instance within moments.` : undefined}
        confirmLabel="Reset"
        required
        loading={reset.isPending}
        onConfirm={(reason) =>
          resetting &&
          reset.mutate(
            { key: resetting.key, body: { version: resetting.version, reason } },
            {
              onSettled: () => setResetting(null),
              onError: (err) => {
                if (isVersionConflict(err)) {
                  toast.warning("Changed underneath you", { description: "The flag moved on; it has been reloaded. Try again." });
                  void flags.refetch();
                } else toast.error("Couldn't reset", { description: errorMessage(err) });
              },
            },
          )
        }
      />
    </>
  );
}

/* ---------- The edit sheet ---------- */

function FlagSheet({ flag, open, onClose, enabled, onReset, onRefetch }: { flag?: OpsFlag; open: boolean; onClose: () => void; enabled: boolean; onReset: () => void; onRefetch: () => void }) {
  const save = useSetFlag();
  const history = useFlagHistory(flag?.key, enabled && open);
  const now = useNow(10_000);
  const [form, setForm] = useState<FlagForm>(() => formFromState({ enabled: false, default: false }));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    if (flag) setForm(formFromState(flag.state));
    setReason("");
    setError(undefined);
  }, [flag, open]);
  if (!flag) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Feature flag">
        {open ? <Empty title="Unknown flag" hint="No flag with that key." /> : null}
      </Sheet>
    );
  }
  const check = stateFromForm(form);
  const dirty = check.ok && !sameState(check.state, flag.state);
  const reasonMissing = reason.trim() === "";
  const set = <K extends keyof FlagForm>(k: K, v: FlagForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => {
    if (!check.ok) return;
    setError(undefined);
    save.mutate(
      { key: flag.key, body: { state: check.state, version: flag.version, reason: reason.trim() } },
      {
        onSuccess: () => onClose(),
        onError: (err) => {
          if (needsReason(err)) setError("The app wants a reason for this change.");
          else if (isVersionConflict(err)) {
            setError("The flag changed since you read it; it has been reloaded. Check the values and save again.");
            onRefetch();
          } else if (err instanceof ApiError && err.code === "invalid_flag_state") setError(err.detail || "The app refused the state.");
          else setError(errorMessage(err));
        },
      },
    );
  };
  const inputId = `flag-${flag.key}`;
  const fieldError = (f: keyof FlagForm) => (!check.ok && check.field === f ? check.error : undefined);
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={flag.key}
      meta={`v${flag.version} · ${flag.group}`}
      description={flag.description}
      width="lg"
      footer={
        <>
          {flag.modified && (
            <Button size="sm" kind="ghost" icon={<RotateCcw size={11} />} onClick={onReset} className="mr-auto">
              Reset to declared
            </Button>
          )}
          <Button size="sm" kind="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button size="sm" kind="primary" onClick={submit} disabled={!dirty || reasonMissing || !check.ok} loading={save.isPending}>
            Save as v{flag.version + 1}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error && <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-[12px] text-danger">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Enabled" htmlFor={`${inputId}-enabled`} inline hint="Off answers false for everyone; the rules below are kept for later.">
            <Switch id={`${inputId}-enabled`} checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
          </Field>
          <Field label="Default" htmlFor={`${inputId}-default`} inline hint="The answer when no rule below applies.">
            <Switch id={`${inputId}-default`} checked={form.default} onCheckedChange={(v) => set("default", v)} />
          </Field>
        </div>
        <Field label="Rollout percentage" htmlFor={`${inputId}-pct`} error={fieldError("percentage")} hint={fieldError("percentage") ? undefined : "0 to 100, or empty for no rollout. The share of subjects (the organisation, else the caller) that get true; anonymous callers only follow 0 and 100."}>
          <Input id={`${inputId}-pct`} mono inputMode="numeric" value={form.percentage} onChange={(e) => set("percentage", e.target.value)} placeholder="no rollout" className="w-[140px]" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Users · allow" htmlFor={`${inputId}-ua`} error={fieldError("usersAllow")} hint={fieldError("usersAllow") ? undefined : "IDs that get true, one per line."}>
            <Textarea id={`${inputId}-ua`} mono rows={3} value={form.usersAllow} onChange={(e) => set("usersAllow", e.target.value)} placeholder="usr_…" />
          </Field>
          <Field label="Users · deny" htmlFor={`${inputId}-ud`} hint="IDs that get false; deny wins.">
            <Textarea id={`${inputId}-ud`} mono rows={3} value={form.usersDeny} onChange={(e) => set("usersDeny", e.target.value)} placeholder="usr_…" />
          </Field>
          <Field label="Organisations · allow" htmlFor={`${inputId}-oa`} error={fieldError("orgsAllow")} hint={fieldError("orgsAllow") ? undefined : "For callers acting in an organisation."}>
            <Textarea id={`${inputId}-oa`} mono rows={3} value={form.orgsAllow} onChange={(e) => set("orgsAllow", e.target.value)} placeholder="org_…" />
          </Field>
          <Field label="Organisations · deny" htmlFor={`${inputId}-od`} hint="Deny wins over allow in the same rule.">
            <Textarea id={`${inputId}-od`} mono rows={3} value={form.orgsDeny} onChange={(e) => set("orgsDeny", e.target.value)} placeholder="org_…" />
          </Field>
        </div>
        <Field label="Reason · required" htmlFor={`${inputId}-reason`} hint="Recorded in the flag's history and the audit log.">
          <Textarea id={`${inputId}-reason`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why this change" />
        </Field>
        <KeyList
          rows={[
            { k: "In effect", v: describeFlagState(flag.state) },
            { k: "Declared", v: describeFlagState(flag.declared_state) },
            { k: "Targets", v: String(targetCount(flag.state)) },
            { k: "Client", v: flag.client ? "yes · GET /v1/flags" : "no · server only" },
            { k: "Stored", v: flag.modified ? `yes · v${flag.version}${flag.updated_at ? ` · ${when(flag.updated_at)}` : ""}${flag.updated_by ? ` by ${flag.updated_by}` : ""}` : "no · declared state applies" },
            ...(flag.invalid_stored_value ? [{ k: "Stored value", v: <span className="text-danger">invalid; the declared state applies</span> }] : []),
          ]}
        />
        <Panel title="History" meta="newest first · /history" flush>
          {history.isPending ? (
            <SkeletonLines lines={3} className="p-4" />
          ) : history.error ? (
            <p className="p-4 font-mono text-[11px] text-danger">{errorMessage(history.error)}</p>
          ) : (history.data ?? []).length === 0 ? (
            <Empty title="Never changed" hint="Changes land here with their reason and who made them." />
          ) : (
            <ul>
              {(history.data ?? []).map((h) => (
                <li key={h.id} className="border-t border-hairline px-4 py-2.5 first:border-0">
                  <div className="flex items-center gap-2 font-mono text-[12px]">
                    <span className="text-muted">{h.old_state ? describeFlagState(h.old_state) : "declared"}</span>
                    <span className="text-faint">→</span>
                    <span className="text-text">{h.new_state ? describeFlagState(h.new_state) : "declared"}</span>
                    <Badge tone="muted">v{h.version + 1}</Badge>
                    <span className="ml-auto text-[11px] text-dim tnum">{ago(h.changed_at, now)}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-dim">
                    {h.reason ? `“${h.reason}” · ` : ""}
                    {h.actor_kind} {h.actor_id}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </Sheet>
  );
}

