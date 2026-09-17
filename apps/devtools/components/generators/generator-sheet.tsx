"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, GitBranch, Play, RotateCw, Sparkles } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { Checkbox } from "@gorbital/dash/components/input";
import { Sheet } from "@gorbital/dash/components/sheet";
import { toast } from "@gorbital/dash/components/toast";
import { ApiError } from "@/lib/api/client";
import { envKeys } from "@/lib/api/env";
import { applyGenerator, planGenerator, type GeneratorInputs, type HubGenerator, type NormalizedResponse } from "@/lib/api/generators";
import { projectKeys } from "@/lib/api/project";
import { keys, useAppAction, useMigrate } from "@/lib/api/queries";
import type { Plan } from "@/lib/api/types";
import { generatorInfo } from "@/lib/generators/catalog";
import { isFileListPlan, isNoop } from "@/lib/generators/plan";
import { CopyButton } from "@/components/jobs/plan-diff";
import { GeneratorError, PlanPanel } from "./plan-panel";

export type Stage = { kind: "idle" } | { kind: "planning" } | { kind: "planned"; response: NormalizedResponse } | { kind: "applying"; response: NormalizedResponse } | { kind: "applied"; response: NormalizedResponse };

/**
 * The plan → diff → apply flow every generator goes through, as the Jobs
 * screen's sheet does it: Preview posts `plan`, Apply posts `apply` with
 * `allow_dirty` from the checkbox, the CLI's errors show inline.
 */
export function useGeneratorFlow<N extends HubGenerator>(name: N) {
  const qc = useQueryClient();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState<unknown>();
  const [allowDirty, setAllowDirty] = useState(false);

  const reset = useCallback(() => {
    setStage({ kind: "idle" });
    setError(undefined);
  }, []);

  /** The form changed after a preview: the plan is stale. */
  const stale = useCallback(() => setStage((s) => (s.kind === "planned" ? { kind: "idle" } : s)), []);

  const preview = useCallback(
    async (input: GeneratorInputs[N]) => {
      setStage({ kind: "planning" });
      setError(undefined);
      try {
        const response = await planGenerator(name, input);
        setStage({ kind: "planned", response });
      } catch (err) {
        setError(err);
        setStage({ kind: "idle" });
      }
    },
    [name],
  );

  const apply = useCallback(
    async (input: GeneratorInputs[N], previous: NormalizedResponse) => {
      setStage({ kind: "applying", response: previous });
      setError(undefined);
      try {
        const response = await applyGenerator(name, input, allowDirty);
        setStage({ kind: "applied", response });
        const n = response.plan.changes.length;
        const ran = isFileListPlan(response.plan);
        toast.success(ran ? `orb add orgs ran` : n ? `Wrote ${n} file${n === 1 ? "" : "s"}` : "Nothing to change", { description: ran ? "review the branch in git" : response.plan.name });
        void qc.invalidateQueries({ queryKey: keys.status });
        void qc.invalidateQueries({ queryKey: keys.devMigrations });
        void qc.invalidateQueries({ queryKey: ["db"] });
        void qc.invalidateQueries({ queryKey: projectKeys.all });
        void qc.invalidateQueries({ queryKey: envKeys.list });
      } catch (err) {
        setError(err);
        setStage({ kind: "planned", response: previous });
      }
    },
    [name, allowDirty, qc],
  );

  return { stage, error, allowDirty, setAllowDirty, preview, apply, reset, stale };
}

type Props<N extends HubGenerator> = {
  name: N;
  open: boolean;
  onClose: () => void;
  /** The generator's input when the form is valid; null while it isn't (Preview then marks the form as touched). */
  input: GeneratorInputs[N] | null;
  /** Called when Preview is pressed with an invalid form, so the form shows its errors. */
  onInvalid?: () => void;
  /** The equivalent CLI command, shown with a copy button. */
  command?: string;
  /** Mono text next to the title. */
  meta?: string;
  /** The form; `locked` once the plan was applied, `usageError` the CLI's 422 message so a field can claim it, `plan` the current preview or what was written. */
  children: (ctx: { locked: boolean; stage: Stage["kind"]; usageError?: string; plan?: Plan }) => ReactNode;
};

/** One generator's sheet: the form on top, the preview under it, the flow's buttons in the footer, and what to do after apply. */
export function GeneratorSheet<N extends HubGenerator>({ name, open, onClose, input, onInvalid, command, meta, children }: Props<N>) {
  const info = generatorInfo(name);
  const flow = useGeneratorFlow(name);
  const restart = useAppAction("restart");
  const migrate = useMigrate();
  const [after, setAfter] = useState<"restart" | "migrate" | undefined>();
  const { reset, stale } = flow;
  const inputKey = JSON.stringify(input);

  useEffect(() => {
    if (open) return;
    reset();
    setAfter(undefined);
  }, [open, reset]);

  useEffect(() => {
    stale();
  }, [inputKey, stale]);

  const { stage, error } = flow;
  const busy = stage.kind === "planning" || stage.kind === "applying";
  const locked = stage.kind === "applied";
  const plan = stage.kind === "idle" || stage.kind === "planning" ? undefined : stage.response.plan;
  const noop = plan ? isNoop(plan) : false;
  const canApply = stage.kind === "planned" && !noop;

  const onPreview = () => {
    if (!input) {
      onInvalid?.();
      return;
    }
    void flow.preview(input);
  };
  const onApply = () => {
    if (!input || stage.kind !== "planned") return;
    void flow.apply(input, stage.response);
  };

  const footer = locked ? (
    <>
      <span className="mr-auto text-[11.5px] text-muted">
        {after === "restart" ? "Restart requested; the Overview shows the build." : after === "migrate" ? "Migrating; the Overview shows the migrator's output." : afterHint(info.after, plan ? isFileListPlan(plan) : false)}
      </span>
      {(info.after === "migrate" || info.after === "restart") && (
        <Button size="sm" kind={info.after === "migrate" ? "secondary" : "primary"} icon={<RotateCw size={11} />} onClick={() => { restart.mutate(); setAfter("restart"); }} loading={restart.isPending} disabled={after === "restart"}>
          Restart the app
        </Button>
      )}
      {info.after === "migrate" && (
        <Button size="sm" kind="primary" icon={<Play size={11} />} onClick={() => { migrate.mutate(); setAfter("migrate"); }} loading={migrate.isPending} disabled={after === "migrate"}>
          Apply migrations
        </Button>
      )}
      {info.after === "branch" && (
        <Button size="sm" kind="primary" icon={<GitBranch size={11} />} onClick={onClose}>
          Done
        </Button>
      )}
      {info.after !== "branch" && (
        <Button size="sm" kind="ghost" onClick={onClose}>
          Done
        </Button>
      )}
    </>
  ) : (
    <>
      <label className="mr-auto flex items-center gap-2 text-[11.5px] text-muted">
        <Checkbox checked={flow.allowDirty} onCheckedChange={(v) => flow.setAllowDirty(v === true)} aria-label="Allow uncommitted changes" disabled={name === "add-orgs"} />
        allow uncommitted changes
        <span className="font-mono text-[10.5px] text-dim">--allow-dirty</span>
      </label>
      <Button size="sm" kind={stage.kind === "planned" ? "ghost" : "secondary"} icon={<Eye size={11} />} onClick={onPreview} disabled={busy} loading={stage.kind === "planning"}>
        {stage.kind === "planned" ? "Preview again" : "Preview"}
      </Button>
      <Button size="sm" kind="primary" icon={<Sparkles size={11} />} onClick={onApply} disabled={!canApply && stage.kind !== "applying"} loading={stage.kind === "applying"}>
        {name === "add-orgs" ? "Run orb add orgs" : "Apply"}
      </Button>
    </>
  );

  return (
    <Sheet open={open} onOpenChange={(o) => !o && !busy && onClose()} title={info.title} meta={meta ?? info.cli} description={info.blurb} width="lg" footer={footer}>
      <div className="grid min-w-0 gap-4">
        {children({ locked, stage: stage.kind, usageError: error instanceof ApiError && error.status === 422 ? error.detail : undefined, plan })}
        {command && (
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">The same from a terminal</span>
              <CopyButton text={command} label="Copy command" />
            </div>
            <Code className="whitespace-pre-wrap break-all text-text">{command}</Code>
          </div>
        )}
        {error !== undefined && <GeneratorError error={error} />}
        {plan && <PlanPanel plan={plan} applied={locked} />}
      </div>
    </Sheet>
  );
}

function afterHint(after: "restart" | "migrate" | "branch" | "none", ran: boolean): string {
  switch (after) {
    case "migrate":
      return "Files written. Apply the migration, then restart so the app picks up the new code.";
    case "restart":
      return "Files written. The app reads them when it restarts.";
    case "branch":
      return ran ? "orb add orgs ran on its branch; review and merge it in git." : "Nothing to change.";
    default:
      return "Done.";
  }
}
