"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Input, Select, Switch } from "@gorbital/dash/components/input";
import { useSetEnv } from "@/lib/api/env";
import { setKey } from "@/lib/project/env-keys";

export type EnvControl = { kind: "text"; mono?: boolean; placeholder?: string; inputMode?: "numeric" | "text" } | { kind: "select"; options: { value: string; label: string }[] } | { kind: "switch"; on: string; off: string };

type Props = {
  label: string;
  /** The env key behind the value, from the project settings. */
  envKey: string;
  /** The value as .env has it (the string the control edits). */
  value: string;
  /** What to show when not editing; the value by default. */
  display?: ReactNode;
  hint?: ReactNode;
  control: EnvControl;
  /** Why the value can't be saved; undefined when it can. */
  validate?: (value: string) => string | undefined;
  /** No env editor on this orb, or a value the screen shows but doesn't edit. */
  readOnly?: boolean;
  /** Called after a save with the editor's `restart_needed`. */
  onSaved: (restartNeeded: boolean) => void;
};

/** One row of a settings section: the value with its env key, an Edit button, the control in place, Save and Cancel. */
export function EnvField({ label, envKey, value, display, hint, control, validate, readOnly, onSaved }: Props) {
  const save = useSetEnv();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  const error = editing && validate ? validate(draft) : undefined;

  const commit = async (v = draft) => {
    if (validate?.(v)) return;
    try {
      const res = await save.mutateAsync(setKey(envKey, v));
      setEditing(false);
      onSaved(res.restart_needed);
    } catch {
      // The toast said what went wrong; stay in edit mode.
    }
  };

  const view = display ?? (value === "" ? <span className="text-dim">not set</span> : <span className="font-mono text-text">{value}</span>);

  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] items-start gap-3 border-b border-hairline py-2.5 last:border-b-0">
      <div className="pt-1">
        <div className="text-[12px] text-text">{label}</div>
        <div className="mt-0.5">
          <Badge tone="muted">{envKey}</Badge>
        </div>
      </div>
      <div className="grid min-w-0 gap-1">
        {control.kind === "switch" && !readOnly ? (
          <div className="flex items-center gap-2 pt-1">
            <Switch checked={value === control.on} onCheckedChange={(v) => void commit(v ? control.on : control.off)} disabled={save.isPending} aria-label={label} />
            <span className="text-[12px] text-muted">{view}</span>
          </div>
        ) : editing ? (
          <div className="flex items-start gap-2">
            {control.kind === "select" ? (
              <Select value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={label} className="max-w-[360px]">
                {control.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                mono={control.kind === "text" ? control.mono !== false : true}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={control.kind === "text" ? control.placeholder : undefined}
                inputMode={control.kind === "text" ? control.inputMode : undefined}
                aria-label={label}
                className="max-w-[360px]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commit();
                  if (e.key === "Escape") setEditing(false);
                }}
              />
            )}
            <Button size="sm" kind="primary" icon={<Check size={11} />} onClick={() => void commit()} loading={save.isPending} disabled={Boolean(error)}>
              Save
            </Button>
            <Button size="sm" kind="ghost" icon={<X size={11} />} onClick={() => setEditing(false)} disabled={save.isPending}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 pt-1">
            <span className="min-w-0 truncate text-[12px]">{view}</span>
            {!readOnly && (
              <Button size="sm" kind="ghost" icon={<Pencil size={11} />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
          </div>
        )}
        {error ? <div className="text-[11px] text-danger">{error}</div> : hint ? <div className="text-[11px] text-dim">{hint}</div> : null}
      </div>
    </div>
  );
}

/** A read-only row in the same grid. */
export function InfoRow({ label, children, badge }: { label: string; children: ReactNode; badge?: string }) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] items-start gap-3 border-b border-hairline py-2.5 last:border-b-0">
      <div className="pt-0.5">
        <div className="text-[12px] text-text">{label}</div>
        {badge && (
          <div className="mt-0.5">
            <Badge tone="muted">{badge}</Badge>
          </div>
        )}
      </div>
      <div className="min-w-0 pt-0.5 text-[12px]">{children}</div>
    </div>
  );
}
