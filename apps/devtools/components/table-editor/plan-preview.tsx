"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Eye, FileCode2, Play } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { Checkbox } from "@gorbital/dash/components/input";
import { toast } from "@gorbital/dash/components/toast";
import { ApiError } from "@/lib/api/client";
import { applyDDL, dbKeys, planDDL, readMigrations, waitForMigrations, type Change, type DDLResponse } from "@/lib/api/db";
import { ProblemNote, SectionLabel } from "./common";

type Stage = { kind: "idle" } | { kind: "planning" } | { kind: "planned"; plans: DDLResponse[] } | { kind: "applying"; plans: DDLResponse[]; at: number } | { kind: "done"; plans: DDLResponse[] };

export type PlanFlow = {
  stage: Stage;
  plans: DDLResponse[];
  error: unknown;
  busy: boolean;
  allowDirty: boolean;
  setAllowDirty: (v: boolean) => void;
  preview: () => Promise<void>;
  apply: () => Promise<void>;
};

function isDirtyError(err: unknown) {
  return err instanceof ApiError && /uncommitted|allow-dirty|allow_dirty/i.test(err.detail);
}

/**
 * The migration-plan flow every schema change goes through: `preview` asks
 * the portal to render the SQL for each change, `apply` writes the
 * migration file(s) in order and waits for orb dev to run them, then drops
 * the catalog queries. Changing `changes` starts over.
 */
export function usePlanFlow(changes: Change[], name?: string, onApplied?: () => void): PlanFlow {
  const qc = useQueryClient();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState<unknown>();
  const [allowDirty, setAllowDirty] = useState(false);
  const signature = JSON.stringify(changes);

  useEffect(() => {
    setStage({ kind: "idle" });
    setError(undefined);
  }, [signature]);

  const preview = useCallback(async () => {
    setStage({ kind: "planning" });
    setError(undefined);
    const plans: DDLResponse[] = [];
    try {
      for (const change of changes) plans.push(await planDDL({ change, name }));
      setStage({ kind: "planned", plans });
    } catch (err) {
      setError(err);
      setStage({ kind: "idle" });
    }
  }, [changes, name]);

  const apply = useCallback(async () => {
    if (stage.kind !== "planned") return;
    const plans = [...stage.plans];
    setError(undefined);
    let i = 0;
    try {
      for (; i < changes.length; i++) {
        setStage({ kind: "applying", plans, at: i });
        const before = await readMigrations();
        plans[i] = await applyDDL({ change: changes[i], name, allow_dirty: allowDirty || undefined });
        const settled = await waitForMigrations(before);
        if (!settled) toast.warning("Still migrating", { description: `${plans[i].file.path} was written; orb dev hasn't finished applying it` });
      }
      setStage({ kind: "done", plans });
      toast.success(changes.length === 1 ? "Migration applied" : `${changes.length} migrations applied`, { description: plans.map((p) => p.file.path).join(", ") });
      void qc.invalidateQueries({ queryKey: dbKeys.all });
      onApplied?.();
    } catch (err) {
      setError(err);
      // What was applied before the failure stays applied; the rest can be retried.
      setStage(i === 0 ? { kind: "planned", plans } : { kind: "done", plans: plans.slice(0, i) });
      void qc.invalidateQueries({ queryKey: dbKeys.all });
    }
  }, [stage, changes, name, allowDirty, qc, onApplied]);

  const plans = stage.kind === "planned" || stage.kind === "applying" || stage.kind === "done" ? stage.plans : [];
  return { stage, plans, error, busy: stage.kind === "planning" || stage.kind === "applying", allowDirty, setAllowDirty, preview, apply };
}

/** The rendered plans: summary, file, Up, Down, notes, and any error. */
export function PlanBody({ flow }: { flow: PlanFlow }) {
  const { stage, plans, error } = flow;
  return (
    <div className="grid gap-3">
      {error !== undefined && (
        <div className="grid gap-1.5">
          <ProblemNote error={error} />
          {isDirtyError(error) && <div className="text-[11.5px] text-warn">The app&apos;s git tree has uncommitted changes. Commit them, or tick &ldquo;allow uncommitted changes&rdquo; and apply again.</div>}
        </div>
      )}
      {plans.map((p, i) => (
        <div key={i} className="grid gap-2 rounded-lg border border-hairline bg-bg/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium text-text">{p.plan.summary}</span>
            {p.plan.irreversible && (
              <Badge tone="danger">
                <AlertTriangle size={10} /> irreversible
              </Badge>
            )}
            {p.plan.no_transaction && <Badge tone="warn">no transaction</Badge>}
            {p.applied && <Badge tone="ok">applied</Badge>}
            {stage.kind === "applying" && stage.at === i && <Badge tone="accent">applying…</Badge>}
            <span className="ml-auto flex items-center gap-1 font-mono text-[10.5px] text-dim">
              <FileCode2 size={11} /> {p.file.path}
            </span>
          </div>
          {p.plan.notes?.map((n, j) => (
            <div key={j} className="flex items-start gap-1.5 text-[11.5px] text-warn">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {n}
            </div>
          ))}
          <SectionLabel>Up</SectionLabel>
          <Code className="text-text">{p.plan.up.join("\n")}</Code>
          <details>
            <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-[0.12em] text-dim hover:text-text">Down</summary>
            <Code className="mt-2">{p.plan.down.length ? p.plan.down.join("\n") : "-- nothing to undo"}</Code>
          </details>
        </div>
      ))}
      {stage.kind === "done" && <div className="text-[12px] text-ok">Applied. The migration file is in the app&apos;s repository; commit it with your change.</div>}
    </div>
  );
}

type ActionProps = {
  flow: PlanFlow;
  /** The form isn't ready: no preview yet. */
  disabled?: boolean;
  applyLabel?: string;
  danger?: boolean;
};

/** Preview, the allow-dirty checkbox, and Apply; put it in a footer. */
export function PlanActions({ flow, disabled, applyLabel = "Apply", danger }: ActionProps) {
  const { stage, busy, allowDirty, setAllowDirty, preview, apply } = flow;
  return (
    <>
      {stage.kind !== "done" && (
        <label className="mr-auto flex items-center gap-2 text-[11.5px] text-muted">
          <Checkbox checked={allowDirty} onCheckedChange={(v) => setAllowDirty(v === true)} aria-label="Allow uncommitted changes" />
          allow uncommitted changes
          <span className="font-mono text-[10.5px] text-dim">--allow-dirty</span>
        </label>
      )}
      {stage.kind !== "done" && (
        <Button size="sm" kind={stage.kind === "planned" ? "ghost" : "secondary"} icon={<Eye size={11} />} onClick={() => void preview()} disabled={disabled || busy} loading={stage.kind === "planning"}>
          {stage.kind === "planned" ? "Preview again" : "Preview"}
        </Button>
      )}
      {stage.kind !== "done" && (
        <Button size="sm" kind={danger ? "danger" : "primary"} icon={<Play size={11} />} onClick={() => void apply()} disabled={stage.kind !== "planned" && stage.kind !== "applying"} loading={stage.kind === "applying"}>
          {applyLabel}
        </Button>
      )}
    </>
  );
}
