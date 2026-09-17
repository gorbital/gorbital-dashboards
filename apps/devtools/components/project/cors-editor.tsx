"use client";

import { useEffect, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Input } from "@gorbital/dash/components/input";
import { Panel } from "@gorbital/dash/components/panel";
import { useSetEnv } from "@/lib/api/env";
import { validateOrigins } from "@/lib/project/cors";
import { corsChange } from "@/lib/project/env-keys";

type Props = { origins: string[]; envKey: string; readOnly?: boolean; onSaved: (restartNeeded: boolean) => void };

/** The CORS origins as a list, one per row, saved as the comma-separated `APP_CORS_ORIGINS`. */
export function CorsEditor({ origins, envKey, readOnly, onSaved }: Props) {
  const save = useSetEnv();
  const [rows, setRows] = useState<string[]>(origins);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setRows(origins);
  }, [origins, editing]);
  const errors = validateOrigins(rows.filter((r) => r.trim() !== "" || rows.length === 1).length ? rows : rows);
  const problems = Object.keys(errors).filter((i) => rows[Number(i)].trim() !== "").length;

  const commit = async () => {
    const list = rows.map((r) => r.trim()).filter(Boolean);
    if (Object.keys(validateOrigins(list)).length) return;
    try {
      const res = await save.mutateAsync(corsChange(envKey, list));
      setEditing(false);
      onSaved(res.restart_needed);
    } catch {
      // toasted
    }
  };

  return (
    <Panel
      title="CORS origins"
      meta={<Badge tone="muted">{envKey}</Badge>}
      actions={
        readOnly ? undefined : editing ? (
          <>
            <Button size="sm" kind="ghost" icon={<X size={11} />} onClick={() => setEditing(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button size="sm" kind="primary" icon={<Check size={11} />} onClick={() => void commit()} loading={save.isPending} disabled={problems > 0}>
              Save
            </Button>
          </>
        ) : (
          <Button size="sm" kind="secondary" icon={<Plus size={11} />} onClick={() => { setEditing(true); setRows(origins.length ? origins : [""]); }}>
            Edit
          </Button>
        )
      }
    >
      <div className="grid gap-2">
        <div className="text-[11.5px] text-muted">Browser origins allowed to call the API; the app matches them exactly (scheme and host, no path, no wildcard). Empty disables CORS. https only in production.</div>
        {editing ? (
          <div className="grid gap-1.5">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <Input mono value={r} onChange={(e) => setRows(rows.map((x, j) => (j === i ? e.target.value : x)))} placeholder="https://app.example.com" aria-label={`Origin ${i + 1}`} autoFocus={i === rows.length - 1} />
                <Button size="sm" kind="ghost" icon={<Trash2 size={11} />} onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove origin ${i + 1}`}>
                  <span className="sr-only">Remove</span>
                </Button>
                {errors[i] && r.trim() !== "" && <div className="col-span-2 -mt-1 text-[11px] text-danger">{errors[i]}</div>}
              </div>
            ))}
            <div>
              <Button size="sm" kind="ghost" icon={<Plus size={11} />} onClick={() => setRows([...rows, ""])}>
                Add origin
              </Button>
            </div>
          </div>
        ) : origins.length === 0 ? (
          <div className="text-[12px] text-dim">none: CORS is off</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {origins.map((o) => (
              <span key={o} className="rounded-md border border-hairline bg-bg/40 px-2 py-0.5 font-mono text-[11.5px] text-text">
                {o}
              </span>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
