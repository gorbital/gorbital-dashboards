"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Copy, Eye, EyeOff, Pencil, Plus, RefreshCw, RotateCw, Search, Trash2, X } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { ConfirmDialog } from "@gorbital/dash/components/dialog";
import { Field, Input } from "@gorbital/dash/components/input";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { Segmented } from "@gorbital/dash/components/pill";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import { toast } from "@gorbital/dash/components/toast";
import { fmtInt } from "@gorbital/dash/lib/format";
import { isNoEnvEditor, revealEnv, useDevConfig, useEnv, useUpdateEnv, type EnvEntry } from "@/lib/api/env";
import { errorMessage } from "@/lib/api/errors";
import { useAppAction, useCapabilities } from "@/lib/api/queries";
import { copyText } from "@/lib/copy";
import { entryBadges, filterEntries, groupEntries, keyNameError, missingCount, shownValue, valueError, type EnvBadge, type EnvShow } from "@/lib/environment/env";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { QueryParam, setQueryParam } from "@/components/shared/query-param";

const badgeLook: Record<EnvBadge, { tone: "warn" | "muted" | "violet" | "info"; label: string; title: string }> = {
  missing: { tone: "warn", label: "missing from .env", title: ".env.example lists this key and .env doesn't have it" },
  not_in_example: { tone: "muted", label: "not in .env.example", title: "Only .env has it; the example doesn't document it" },
  secret: { tone: "violet", label: "secret", title: "Masked by its name until revealed" },
  empty: { tone: "muted", label: "empty", title: "Set to an empty value" },
  not_read: { tone: "info", label: "not read by the app", title: "The running app's configuration (/_dev/config) doesn't include this key" },
};

/**
 * The Environment screen (ADR-0074): `.env` against `.env.example`, every
 * key with its description, secrets masked until revealed, missing keys
 * flagged, add, edit and delete in place, and a restart after a change.
 */
export function Environment() {
  const caps = useCapabilities();
  const env = useEnv(Boolean(caps.status.data));
  const config = useDevConfig(caps.console);
  const update = useUpdateEnv();
  const restart = useAppAction("restart");
  const [q, setQ] = useState("");
  const [show, setShow] = useState<EnvShow>("all");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<EnvEntry | null>(null);
  /** Set after a change; cleared when the app starts again. */
  const [changed, setChanged] = useState(false);
  const [restartFrom, setRestartFrom] = useState<string | undefined>(undefined);
  const onQ = useCallback((v: string | null) => setQ(v ?? ""), []);

  const app = caps.status.data?.app;
  useEffect(() => {
    if (restartFrom !== undefined && app?.state === "running" && app.started_at && app.started_at !== restartFrom) {
      setChanged(false);
      setRestartFrom(undefined);
      toast.success("The app restarted with the new .env");
    }
  }, [app?.state, app?.started_at, restartFrom]);

  const entries = useMemo(() => env.data?.entries ?? [], [env.data]);
  const shown = useMemo(() => filterEntries(entries, q, show), [entries, q, show]);
  const groups = useMemo(() => groupEntries(shown), [shown]);
  const missing = missingCount(entries);
  const variables = config.data?.variables;

  const setSearch = (v: string) => {
    setQ(v);
    setQueryParam("q", v || null);
  };

  const save = (key: string, value: string) =>
    update.mutateAsync({ set: { [key]: value } }).then(() => {
      setChanged(true);
      setRevealed((r) => {
        const { [key]: _gone, ...rest } = r;
        void _gone;
        return rest;
      });
    });

  const reveal = async (key: string) => {
    setRevealing(key);
    try {
      const r = await revealEnv(key);
      setRevealed((prev) => ({ ...prev, [key]: r.value }));
    } catch (err) {
      toast.error(`Couldn't reveal ${key}`, { description: errorMessage(err) });
    } finally {
      setRevealing(null);
    }
  };
  const hide = (key: string) =>
    setRevealed((r) => {
      const { [key]: _gone, ...rest } = r;
      void _gone;
      return rest;
    });

  const doRestart = () => {
    setRestartFrom(app?.started_at ?? "");
    restart.mutate();
  };

  const noEditor = isNoEnvEditor(env.error);

  return (
    <>
      <Suspense fallback={null}>
        <QueryParam name="q" onValue={onQ} />
      </Suspense>
      <PageHeader product="devtools" title="Environment" description={env.data ? `${env.data.file} against ${env.data.example} · ${fmtInt(entries.length)} keys · ${missing ? `${missing} missing` : "nothing missing"}${variables ? ` · the app read ${variables.length}` : ""}` : ".env against .env.example: secrets hidden until revealed, missing keys flagged, edited in place"}>
        <Segmented<EnvShow>
          value={show}
          onChange={setShow}
          options={[
            { value: "all", label: "All" },
            { value: "missing", label: `Missing${missing ? ` ${missing}` : ""}` },
            { value: "secrets", label: "Secrets" },
            { value: "extra", label: "Not in example" },
          ]}
        />
        <div className="relative">
          <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
          <Input value={q} onChange={(e) => setSearch(e.target.value)} placeholder="Search keys and descriptions" className="w-[240px] pl-7" aria-label="Search the environment" />
        </div>
        <Button size="sm" kind="primary" icon={<Plus size={11} />} onClick={() => setAdding((a) => !a)} disabled={noEditor}>
          Add key
        </Button>
        <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />} onClick={() => void Promise.all([env.refetch(), config.refetch()])} loading={env.isFetching}>
          Refresh
        </Button>
      </PageHeader>
      <Page>
        {(changed || (restartFrom !== undefined && app?.state !== "running")) && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warn/30 bg-warn/8 px-4 py-2.5 text-[12px]">
            <AlertTriangle size={13} className="text-warn" />
            <span className="text-text">The app reads .env when it starts.</span>
            <span className="text-muted">{restartFrom !== undefined ? (app?.state === "building" ? "Rebuilding…" : app?.state === "stopped" ? "The app is stopped; start it from the Overview." : "Restarting…") : "Restart it to apply the change; the build output shows anything it refuses."}</span>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/" className="text-[12px] text-primary hover:underline">
                Overview
              </Link>
              <Button size="sm" kind="secondary" icon={<RotateCw size={11} />} onClick={doRestart} loading={restart.isPending || (restartFrom !== undefined && app?.state === "building")} disabled={app?.state === "preparing"}>
                Restart the app
              </Button>
            </div>
          </div>
        )}
        {app?.problem && (
          <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/8 px-4 py-2.5 text-[12px]">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-danger" />
            <div className="min-w-0">
              <div className="font-medium text-text">The app didn't come up</div>
              <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-danger">{app.problem}</pre>
              <p className="mt-1 text-muted">
                A refused variable is named in the output; fix it here and restart. The full output is on the <Link href="/" className="text-primary hover:underline">Overview</Link>.
              </p>
            </div>
          </div>
        )}
        {adding && (
          <AddKey
            existing={entries.map((e) => e.key)}
            saving={update.isPending}
            onCancel={() => setAdding(false)}
            onAdd={(key, value) =>
              save(key, value).then(
                () => setAdding(false),
                () => {},
              )
            }
          />
        )}
        {env.error && !env.data ? (
          noEditor ? (
            <Panel>
              <Empty title="This orb dev edits no .env" hint="Run orb dev in the app's directory; it reads and rewrites the app's .env there." />
            </Panel>
          ) : (
            <ProblemPanel error={env.error} scope="portal" meta="GET /_portal/api/env" onRetry={() => void env.refetch()} retrying={env.isFetching} />
          )
        ) : env.isPending ? (
          <Panel flush>
            <SkeletonLines lines={10} className="p-4" />
          </Panel>
        ) : shown.length === 0 ? (
          <Panel>
            <Empty title={entries.length === 0 ? "No keys" : "Nothing matches"} hint={entries.length === 0 ? "Neither .env nor .env.example has a key; add one above." : "Try another word, or All."} />
          </Panel>
        ) : (
          <Panel flush>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-hairline text-left font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
                    <th className="w-[260px] px-4 py-2 font-normal">Key</th>
                    <th className="w-[36%] px-3 py-2 font-normal">Value</th>
                    <th className="px-3 py-2 font-normal">Description</th>
                    <th className="w-[84px] px-3 py-2 font-normal" />
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <GroupRows key={g.name} name={g.name} entries={g.entries} variables={variables} revealed={revealed} revealing={revealing} editing={editing} saving={update.isPending} onEdit={setEditing} onSave={save} onReveal={reveal} onHide={hide} onDelete={setDeleting} />
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </Page>
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Remove ${deleting?.key} from .env?`}
        description={deleting?.in_example ? "The line goes; .env.example still lists the key, so it shows as missing until set again. The app reads the change when it restarts." : "The line goes from .env. The app reads the change when it restarts."}
        confirmLabel="Remove"
        danger
        loading={update.isPending}
        onConfirm={() => {
          if (!deleting) return;
          update.mutate(
            { unset: [deleting.key] },
            {
              onSuccess: () => {
                setChanged(true);
                hide(deleting.key);
              },
              onSettled: () => setDeleting(null),
            },
          );
        }}
      />
    </>
  );
}

type RowsProps = {
  name: string;
  entries: EnvEntry[];
  variables: { name: string; secret: boolean; set: boolean; value?: string }[] | undefined;
  revealed: Record<string, string>;
  revealing: string | null;
  editing: string | null;
  saving: boolean;
  onEdit: (key: string | null) => void;
  onSave: (key: string, value: string) => Promise<unknown>;
  onReveal: (key: string) => void;
  onHide: (key: string) => void;
  onDelete: (e: EnvEntry) => void;
};

function GroupRows({ name, entries, variables, revealed, revealing, editing, saving, onEdit, onSave, onReveal, onHide, onDelete }: RowsProps) {
  return (
    <>
      <tr className="border-b border-hairline bg-elevated/30">
        <td colSpan={4} className="px-4 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
          {name}
          <span className="ml-2 normal-case tracking-normal text-faint">{entries.length}</span>
        </td>
      </tr>
      {entries.map((e) => (
        <Row key={e.key} entry={e} badges={entryBadges(e, variables)} revealed={revealed} revealing={revealing === e.key} editing={editing === e.key} saving={saving} onEdit={onEdit} onSave={onSave} onReveal={onReveal} onHide={onHide} onDelete={onDelete} />
      ))}
    </>
  );
}

type RowProps = Omit<RowsProps, "name" | "entries" | "variables" | "revealing" | "editing"> & { entry: EnvEntry; badges: EnvBadge[]; revealing: boolean; editing: boolean };

function Row({ entry, badges, revealed, revealing, editing, saving, onEdit, onSave, onReveal, onHide, onDelete }: RowProps) {
  const { value, masked } = shownValue(entry, revealed);
  return (
    <tr className={`border-b border-hairline align-top hover:bg-elevated/30 ${entry.missing ? "bg-warn/4" : ""}`}>
      <td className="px-4 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`font-mono ${entry.set ? "text-text" : "text-muted"}`}>{entry.key}</span>
          {badges.map((b) => (
            <Tooltip key={b} content={badgeLook[b].title}>
              <span>
                <Badge tone={badgeLook[b].tone} mono={false}>
                  {badgeLook[b].label}
                </Badge>
              </span>
            </Tooltip>
          ))}
        </div>
        {entry.line > 0 && <div className="mt-0.5 font-mono text-[10.5px] text-faint">.env:{entry.line}</div>}
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <ValueEditor entry={entry} initial={masked ? "" : value} masked={masked} saving={saving} onSave={(v) => onSave(entry.key, v).then(() => onEdit(null))} onCancel={() => onEdit(null)} />
        ) : !entry.set ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] text-dim">not set</span>
            {entry.example !== "" && (
              <span className="font-mono text-[11px] text-faint">
                example: <span className="text-dim">{entry.example}</span>
              </span>
            )}
            <Button size="sm" kind="ghost" onClick={() => void onSave(entry.key, entry.example)} disabled={saving}>
              {entry.example !== "" ? "Use the example" : "Set empty"}
            </Button>
          </div>
        ) : (
          <div className="flex items-start gap-1.5">
            <span className={`min-w-0 flex-1 break-all font-mono ${value === "" ? "text-faint" : masked ? "tracking-[0.08em] text-muted" : "text-text"}`}>{value === "" ? "(empty)" : value}</span>
            {entry.secret && entry.value !== "" && (
              <Tooltip content={masked ? "Show the value (read from .env now)" : "Hide the value"}>
                <Button size="sm" kind="ghost" onClick={() => (masked ? onReveal(entry.key) : onHide(entry.key))} loading={revealing} aria-label={masked ? `Reveal ${entry.key}` : `Hide ${entry.key}`}>
                  {masked ? <Eye size={11} /> : <EyeOff size={11} />}
                </Button>
              </Tooltip>
            )}
            {!masked && value !== "" && (
              <Tooltip content="Copy the value">
                <Button size="sm" kind="ghost" onClick={() => void copyText(value, `Copied ${entry.key}`)} aria-label={`Copy ${entry.key}`}>
                  <Copy size={11} />
                </Button>
              </Tooltip>
            )}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-muted">{entry.description || <span className="text-faint">—</span>}</td>
      <td className="px-3 py-1.5 text-right">
        {!editing && (
          <div className="flex justify-end gap-0.5">
            <Tooltip content={entry.set ? "Edit the value" : "Set a value"}>
              <Button size="sm" kind="ghost" onClick={() => onEdit(entry.key)} aria-label={`Edit ${entry.key}`}>
                <Pencil size={11} />
              </Button>
            </Tooltip>
            {entry.set && (
              <Tooltip content="Remove the line from .env">
                <Button size="sm" kind="ghost" onClick={() => onDelete(entry)} aria-label={`Remove ${entry.key}`}>
                  <Trash2 size={11} />
                </Button>
              </Tooltip>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

/** The inline editor: Enter saves, Escape cancels. A masked secret starts empty (the value is never copied into the field unrevealed). */
function ValueEditor({ entry, initial, masked, saving, onSave, onCancel }: { entry: EnvEntry; initial: string; masked: boolean; saving: boolean; onSave: (v: string) => Promise<unknown>; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const error = valueError(v);
  const submit = () => {
    if (error) return;
    void onSave(v).catch(() => {});
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-1.5">
        <Input mono autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={onKey} placeholder={masked ? "new value (the current one stays hidden)" : entry.example || "value"} aria-label={`Value of ${entry.key}`} aria-invalid={Boolean(error) || undefined} />
        <Button size="sm" kind="primary" onClick={submit} loading={saving} disabled={Boolean(error)} icon={<Check size={11} />}>
          Save
        </Button>
        <Button size="sm" kind="ghost" onClick={onCancel} disabled={saving} aria-label="Cancel">
          <X size={11} />
        </Button>
      </div>
      <span className={`text-[11px] ${error ? "text-danger" : "text-dim"}`}>{error ?? (masked ? "Enter saves a new value for this secret; Esc keeps the current one." : "Enter saves, Esc cancels. Written to .env as is; quoted when it has spaces or #.")}</span>
    </div>
  );
}

/** The add form: a key checked as you type, a value, Enter or Add. */
function AddKey({ existing, saving, onAdd, onCancel }: { existing: string[]; saving: boolean; onAdd: (key: string, value: string) => void; onCancel: () => void }) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const keyErr = key ? keyNameError(key, existing) : undefined;
  const valErr = valueError(value);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const err = keyNameError(key, existing) ?? valErr;
    if (err) return;
    onAdd(key.trim(), value);
  };
  return (
    <Panel title="Add a key" meta="appended to .env, after its .env.example comment when it has one">
      <form onSubmit={submit} className="grid grid-cols-[minmax(200px,1fr)_minmax(240px,2fr)_auto] items-end gap-2">
        <Field label="Key" htmlFor="env-new-key" error={keyErr} hint={keyErr ? undefined : "Letters, digits and underscores."}>
          <Input id="env-new-key" mono autoFocus value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder="P9_TEST" autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="Value" htmlFor="env-new-value" error={valErr} hint={valErr ? undefined : "Written as is; empty is allowed."}>
          <Input id="env-new-value" mono value={value} onChange={(e) => setValue(e.target.value)} placeholder="1" autoComplete="off" spellCheck={false} />
        </Field>
        <div className="flex items-center gap-1.5 pb-[18px]">
          <Button type="submit" size="md" kind="primary" icon={<Plus size={12} />} loading={saving} disabled={!key || Boolean(keyErr) || Boolean(valErr)}>
            Add
          </Button>
          <Button size="md" kind="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  );
}
