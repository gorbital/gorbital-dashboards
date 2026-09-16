"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, RefreshCw, RotateCcw } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Field, Input, Select, Switch, Textarea } from "@gorbital/dash/components/input";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Segmented } from "@gorbital/dash/components/pill";
import { Sheet } from "@gorbital/dash/components/sheet";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Table } from "@gorbital/dash/components/table";
import { toast } from "@gorbital/dash/components/toast";
import { errorMessage, isVersionConflict, needsReason } from "@/lib/api/errors";
import { useCapabilities, useResetSetting, useSetSetting, useSettingHistory, useSettings } from "@/lib/api/queries";
import { describeConstraints, displaySettingValue, formatSettingValue, parseSettingValue } from "@/lib/api/setting-value";
import type { OpsSetting } from "@/lib/api/types";
import { ago, when } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { Gate } from "@/components/shared/gate";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { QueryParam, setQueryParam } from "@/components/shared/query-param";
import { ReasonDialog } from "@/components/shared/reason-dialog";

type Show = "all" | "modified";

export function Settings() {
  const caps = useCapabilities();
  const settings = useSettings(caps.ops);
  const [group, setGroup] = useState<string | null>(null);
  const [show, setShow] = useState<Show>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const onGroup = useCallback((v: string | null) => setGroup(v), []);
  const onKey = useCallback((v: string | null) => setSelectedKey(v), []);
  const [resetting, setResetting] = useState<OpsSetting | null>(null);
  const reset = useResetSetting();

  const all = useMemo(() => settings.data ?? [], [settings.data]);
  const groups = useMemo(() => [...new Set(all.map((s) => s.group))].sort(), [all]);
  const shown = useMemo(() => all.filter((s) => (!group || s.group === group) && (show === "all" || s.modified)), [all, group, show]);
  const selected = all.find((s) => s.key === selectedKey);
  const modified = all.filter((s) => s.modified).length;

  const select = (key: string | null) => {
    setSelectedKey(key);
    setQueryParam("key", key);
  };
  const pickGroup = (g: string | null) => {
    setGroup(g);
    setQueryParam("group", g);
  };

  return (
    <>
      <Suspense fallback={null}>
        <QueryParam name="group" onValue={onGroup} />
        <QueryParam name="key" onValue={onKey} />
      </Suspense>
      <PageHeader product="devtools" title="Settings" description={settings.data ? `${all.length} runtime settings · ${modified} modified · /ops/settings` : "declared in code, stored when changed, applied live"}>
        <Segmented<Show>
          options={[
            { value: "all", label: "All" },
            { value: "modified", label: `Modified${modified ? ` ${modified}` : ""}` },
          ]}
          value={show}
          onChange={setShow}
        />
        <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />} onClick={() => void settings.refetch()} loading={settings.isFetching}>
          Refresh
        </Button>
      </PageHeader>
      <Page>
        <Gate need="ops" loading={<Table<OpsSetting> columns={[]} rows={[]} rowKey={(s) => s.key} loading />}>
          {settings.error && !settings.data ? (
            <ProblemPanel error={settings.error} scope="ops" console={caps.consoleDeclared} meta="GET /ops/settings" onRetry={() => void settings.refetch()} retrying={settings.isFetching} />
          ) : (
            <div className="grid grid-cols-[170px_minmax(0,1fr)] gap-3">
              <aside>
                <div className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Groups</div>
                <ul className="grid gap-0.5 text-[12px]">
                  {[null, ...groups].map((g) => (
                    <li key={g ?? "all"}>
                      <button type="button" onClick={() => pickGroup(g)} className={`flex w-full items-center rounded-md px-2 py-1.5 text-left ${group === g ? "bg-elevated text-text" : "text-muted hover:bg-elevated/60 hover:text-text"}`}>
                        <span className={g ? "font-mono" : ""}>{g ?? "all"}</span>
                        <span className="ml-auto font-mono text-[11px] text-dim tnum">{g ? all.filter((s) => s.group === g).length : all.length}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>
              <Panel flush>
                <Table<OpsSetting>
                  rows={shown}
                  rowKey={(s) => s.key}
                  loading={settings.isPending}
                  dense
                  selected={selectedKey ?? undefined}
                  onRowClick={(s) => select(s.key)}
                  columns={[
                    {
                      key: "k",
                      header: "Key",
                      cell: (s) => (
                        <div className="min-w-0 max-w-[440px]">
                          <div className="flex items-center gap-2 font-mono text-[12px] text-text">
                            <Dot tone={s.invalid_stored_value ? "danger" : s.restart_pending ? "warn" : "ok"} />
                            <span className="truncate">{s.key}</span>
                            <span className="font-mono text-[10.5px] text-faint tnum">v{s.version}</span>
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-dim">{s.description}</div>
                        </div>
                      ),
                    },
                    {
                      key: "v",
                      header: "Value · default",
                      width: "220px",
                      cell: (s) => {
                        const v = displaySettingValue(s.kind, s.value);
                        const d = displaySettingValue(s.kind, s.default);
                        return (
                          <div className="min-w-0 max-w-[220px]">
                            <div className={`truncate font-mono ${s.modified ? "text-primary" : "text-muted"}`}>{v === "" ? <span className="text-faint">(empty)</span> : v}</div>
                            {s.modified && <div className="truncate font-mono text-[10.5px] text-dim">default {d === "" ? "(empty)" : d}</div>}
                          </div>
                        );
                      },
                    },
                    { key: "t", header: "Kind", width: "90px", cell: (s) => <Badge tone="muted">{s.kind}</Badge> },
                    {
                      key: "b",
                      header: "",
                      width: "1%",
                      cell: (s) => (
                        <span className="flex flex-nowrap gap-1">
                          {s.modified && <Badge tone="accent">modified</Badge>}
                          {s.org_overridable && <Badge tone="info">org</Badge>}
                          {s.reason_required && <Badge tone="muted">reason</Badge>}
                          {s.restart_required && <Badge tone={s.restart_pending ? "warn" : "muted"}>{s.restart_pending ? "restart pending" : "restart"}</Badge>}
                          {s.invalid_stored_value && <Badge tone="danger">invalid</Badge>}
                        </span>
                      ),
                    },
                    {
                      key: "a",
                      header: "",
                      width: "1%",
                      align: "right",
                      cell: (s) => (
                        <span className="flex flex-nowrap justify-end gap-0.5">
                          <Button
                            size="sm"
                            kind="ghost"
                            className="px-1.5"
                            aria-label={`Edit ${s.key}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              select(s.key);
                            }}
                          >
                            <Pencil size={11} />
                          </Button>
                          {s.modified && (
                            <Button
                              size="sm"
                              kind="ghost"
                              className="px-1.5"
                              aria-label={`Reset ${s.key}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setResetting(s);
                              }}
                            >
                              <RotateCcw size={11} />
                            </Button>
                          )}
                        </span>
                      ),
                    },
                  ]}
                  empty={<Empty title="No settings" hint={all.length === 0 ? "The app declares no runtime settings." : show === "modified" ? "Nothing differs from the defaults." : "Nothing in this group."} />}
                />
              </Panel>
            </div>
          )}
        </Gate>
      </Page>
      <EditSheet setting={selected} open={Boolean(selectedKey)} onClose={() => select(null)} enabled={caps.ops} onReset={() => selected && setResetting(selected)} onRefetch={() => void settings.refetch()} />
      <ReasonDialog
        open={Boolean(resetting)}
        onOpenChange={(o) => !o && setResetting(null)}
        title={`Reset ${resetting?.key} to its default?`}
        description={resetting ? `Back to ${displaySettingValue(resetting.kind, resetting.default) || "(empty)"}, as declared in code. Applied on every instance at once.` : undefined}
        confirmLabel="Reset"
        required={resetting?.reason_required ?? true}
        loading={reset.isPending}
        onConfirm={(reason) =>
          resetting &&
          reset.mutate(
            { key: resetting.key, body: { version: resetting.version, reason: reason || undefined } },
            {
              onSettled: () => setResetting(null),
              onError: (err) => {
                if (isVersionConflict(err)) {
                  toast.warning("Changed underneath you", { description: "The setting moved on; it has been reloaded. Try again." });
                  void settings.refetch();
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

function EditSheet({ setting, open, onClose, enabled, onReset, onRefetch }: { setting?: OpsSetting; open: boolean; onClose: () => void; enabled: boolean; onReset: () => void; onRefetch: () => void }) {
  const save = useSetSetting();
  const history = useSettingHistory(setting?.key, enabled && open);
  const now = useNow(10_000);
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [askReason, setAskReason] = useState(false);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    if (setting) {
      setText(formatSettingValue(setting.kind, setting.value));
      setAskReason(setting.reason_required);
    }
    setReason("");
    setError(undefined);
  }, [setting, open]);
  if (!setting) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Setting">
        {open ? <Empty title="Unknown setting" hint="No setting with that key." /> : null}
      </Sheet>
    );
  }
  const parsed = parseSettingValue(setting.kind, text, setting.constraints);
  const dirty = parsed.ok && JSON.stringify(parsed.value) !== JSON.stringify(setting.value);
  const reasonMissing = askReason && reason.trim() === "";
  const submit = () => {
    if (!parsed.ok) return;
    setError(undefined);
    save.mutate(
      { key: setting.key, body: { value: parsed.value, version: setting.version, reason: reason.trim() || undefined } },
      {
        onSuccess: onClose,
        onError: (err) => {
          if (needsReason(err)) {
            setAskReason(true);
            setError("This setting needs a reason for every change.");
          } else if (isVersionConflict(err)) {
            setError("Someone changed this setting since you opened it; it has been reloaded with the current value and version. Check it and save again.");
            onRefetch();
          } else setError(errorMessage(err));
        },
      },
    );
  };
  const c = setting.constraints ?? {};
  const inputId = "setting-value";
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={setting.key}
      meta={`v${setting.version} · ${setting.group}`}
      description={setting.description}
      width="lg"
      footer={
        <>
          {setting.modified && (
            <Button size="sm" kind="ghost" icon={<RotateCcw size={11} />} onClick={onReset} className="mr-auto">
              Reset to default
            </Button>
          )}
          <Button size="sm" kind="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button size="sm" kind="primary" onClick={submit} disabled={!dirty || reasonMissing} loading={save.isPending}>
            Save as v{setting.version + 1}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label={`Value · ${describeConstraints(setting.kind, c)}`} htmlFor={inputId} error={!parsed.ok ? parsed.error : undefined} hint={parsed.ok ? `default ${displaySettingValue(setting.kind, setting.default) || "(empty)"}${setting.restart_required ? " · needs a restart to apply" : " · applied live on every instance"}` : undefined}>
          {setting.kind === "bool" ? (
            <div className="flex items-center gap-2 py-1">
              <Switch id={inputId} checked={text === "true"} onCheckedChange={(v) => setText(v ? "true" : "false")} />
              <span className="font-mono text-[12px] text-text">{text}</span>
            </div>
          ) : setting.kind === "enum" && Array.isArray(c.one_of) ? (
            <Select id={inputId} value={text} onChange={(e) => setText(e.target.value)}>
              {c.one_of.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          ) : setting.kind === "string_list" ? (
            <Textarea id={inputId} mono rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="one item per line" />
          ) : (
            <Input id={inputId} mono inputMode={setting.kind === "int" || setting.kind === "float" ? "decimal" : undefined} value={text} onChange={(e) => setText(e.target.value)} placeholder={setting.kind === "duration" ? "e.g. 30m, 24h" : ""} autoFocus />
          )}
        </Field>
        {askReason ? (
          <Field label="Reason · required" htmlFor="setting-reason" error={error} hint={error ? undefined : "Recorded in the setting's history and the audit log."}>
            <Textarea id="setting-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why this change" />
          </Field>
        ) : (
          <Field label="Reason · optional" htmlFor="setting-reason" error={error} hint={error ? undefined : "Recorded in the setting's history; the app asks for one when it insists."}>
            <Textarea id="setting-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why this change" />
          </Field>
        )}
        <KeyList
          rows={[
            { k: "Kind", v: setting.kind },
            { k: "Stored", v: setting.modified ? `yes · v${setting.version}${setting.updated_at ? ` · ${when(setting.updated_at)}` : ""}${setting.updated_by ? ` by ${setting.updated_by}` : ""}` : "no · default applies" },
            { k: "Org overridable", v: setting.org_overridable ? "yes" : "no" },
            { k: "Restart", v: setting.restart_required ? (setting.restart_pending ? "required · pending" : "required after a change") : "not needed" },
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
                    <span className="text-muted">{h.old_value === null ? "default" : displaySettingValue(setting.kind, h.old_value) || "(empty)"}</span>
                    <span className="text-faint">→</span>
                    <span className="text-text">{h.new_value === null ? "default" : displaySettingValue(setting.kind, h.new_value) || "(empty)"}</span>
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
