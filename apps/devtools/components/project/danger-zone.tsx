"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Trash2 } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { ConfirmDialog } from "@gorbital/dash/components/dialog";
import { Panel } from "@gorbital/dash/components/panel";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import { useDangerAction, type DangerAction } from "@/lib/api/project";

/** Each `danger` action as a red row: a confirmation quoting what it loses (the database reset asks to type `reset`), disabled when the portal says it isn't available. */
export function DangerZone({ actions }: { actions: DangerAction[] }) {
  const run = useDangerAction();
  const [pending, setPending] = useState<DangerAction | null>(null);
  const [result, setResult] = useState<{ action: DangerAction; detail?: string } | null>(null);
  const isReset = (a: DangerAction) => a.path.endsWith("/reset-database");
  const unavailableWhy = (a: DangerAction) => (isReset(a) || a.path.includes("/sql/") ? "this app has no database" : a.path.endsWith("/logs") ? "this orb dev keeps no log store" : a.path.endsWith("/mail") ? "orb dev's mail catcher isn't running (MAIL_DELIVERY isn't devmail)" : "not available");

  return (
    <Panel
      title={
        <span className="flex items-center gap-2 text-danger">
          <AlertTriangle size={13} /> Danger zone
        </span>
      }
      meta="each action says what it loses; none can be undone"
    >
      <div className="grid gap-0">
        {actions.map((a) => (
          <div key={a.path} className="flex flex-wrap items-center gap-3 border-b border-danger/15 py-2.5 last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-text">
                {a.name}
                <Badge tone="danger">
                  {a.method} {a.path.replace("/_portal/api/", "")}
                </Badge>
              </div>
              <div className="mt-0.5 text-[11.5px] text-muted">Loses {a.loses}.</div>
              {result?.action.path === a.path && (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ok">
                  {result.detail ?? "done"}
                  {isReset(a) && (
                    <Link href="/" className="inline-flex items-center gap-1 text-primary hover:underline">
                      watch the migrator on the Overview <ArrowRight size={11} />
                    </Link>
                  )}
                </div>
              )}
            </div>
            {a.available ? (
              <Button size="sm" kind="danger" icon={<Trash2 size={11} />} onClick={() => setPending(a)} loading={run.isPending && run.variables?.path === a.path}>
                {a.name}
              </Button>
            ) : (
              <Tooltip content={unavailableWhy(a)}>
                <span>
                  <Button size="sm" kind="danger" icon={<Trash2 size={11} />} disabled>
                    {a.name}
                  </Button>
                </span>
              </Tooltip>
            )}
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && !run.isPending && setPending(null)}
        title={pending?.name ?? ""}
        description={
          pending ? (
            <span>
              This loses <strong className="text-text">{pending.loses}</strong>.{isReset(pending) ? " The public schema is dropped (extensions installed in it go with it), then migrations and seed data run again through orb dev." : ""} It can&apos;t be undone.
            </span>
          ) : undefined
        }
        confirmLabel={pending?.name}
        danger
        confirmText={pending && isReset(pending) ? "reset" : undefined}
        loading={run.isPending}
        onConfirm={async () => {
          if (!pending) return;
          const a = pending;
          try {
            const r = await run.mutateAsync(a);
            setResult({ action: a, detail: r.result?.detail });
          } catch {
            // toasted
          }
          setPending(null);
        }}
      />
    </Panel>
  );
}
