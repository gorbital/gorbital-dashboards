"use client";

import { AlertTriangle, FileCode2, GitBranch } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Code } from "@gorbital/dash/components/code";
import { ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Plan } from "@/lib/api/types";
import { describeOrgsPlan, isFileListPlan, isNoop, nextStepsPreformatted, summaryLines } from "@/lib/generators/plan";
import { PlanFile } from "@/components/jobs/plan-diff";

/** Whether the portal refused an apply for uncommitted changes: the hint points at the checkbox. */
export function isDirtyError(err: unknown) {
  return err instanceof ApiError && /uncommitted|allow-dirty|allow_dirty/i.test(err.detail);
}

/** The request's error, inline: the status and code, the CLI's message, and the dirty-tree hint when that's what it is. */
export function GeneratorError({ error }: { error: unknown }) {
  return (
    <div className="grid gap-1.5">
      <div className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-[12px]">
        {error instanceof ApiError && (
          <span className="mr-2 font-mono text-[10.5px] uppercase tracking-wider text-danger">
            {error.status} {error.code}
          </span>
        )}
        <span className="whitespace-pre-wrap font-mono text-[11.5px] text-text">{errorMessage(error)}</span>
      </div>
      {isDirtyError(error) && (
        <div className="flex items-start gap-1.5 text-[11.5px] text-warn">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> The app&apos;s git tree has uncommitted changes. Commit them, or tick &ldquo;allow uncommitted changes&rdquo; and apply again.
        </div>
      )}
      {error instanceof ApiError && error.status === 409 && !isDirtyError(error) && (
        <div className="flex items-start gap-1.5 text-[11.5px] text-warn">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> A file the plan writes exists or changed since the preview. Preview again, or pick another name.
        </div>
      )}
    </div>
  );
}

/**
 * A plan as the hub shows it: the CLI's summary as it prints it, then the
 * files (diffs, or a file list for the `add-orgs` dry run), then the next
 * steps (numbered, or as the CLI laid them out).
 */
export function PlanPanel({ plan, applied, stale }: { plan: Plan; applied: boolean; stale?: boolean }) {
  const noop = isNoop(plan);
  const fileList = !noop && isFileListPlan(plan);
  const created = plan.changes.filter((c) => c.kind === "create").length;
  const modified = plan.changes.length - created;
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">{applied ? "Written" : "Preview"}</span>
        {applied ? <Badge tone="ok">{fileList ? "ran" : "written"}</Badge> : stale ? <Badge tone="warn">the form changed; preview again</Badge> : <Badge tone="muted">nothing written yet</Badge>}
        {!noop && (
          <span className="text-[12px] text-muted">
            {fileList ? `${plan.changes.length} files` : `${created} to create, ${modified} to modify`}
          </span>
        )}
      </div>
      {plan.summary && (
        <div className={`rounded-lg border border-hairline bg-bg/40 px-3 py-2 font-mono text-[11.5px] leading-[1.6] ${noop ? "text-muted" : "text-text"}`}>
          {summaryLines(plan.summary).map((l, i) => (
            <div key={i} className="whitespace-pre-wrap">
              {l || " "}
            </div>
          ))}
        </div>
      )}
      {fileList ? <OrgsFiles plan={plan} applied={applied} /> : plan.changes.map((c, i) => <PlanFile key={c.path} change={c} open={i === 0 && plan.changes.length <= 8} />)}
      {plan.next?.length > 0 && <NextSteps next={plan.next} />}
    </div>
  );
}

function NextSteps({ next }: { next: string[] }) {
  if (nextStepsPreformatted(next)) {
    return (
      <div className="grid gap-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Next</div>
        <Code className="whitespace-pre-wrap text-muted">{next.join("\n").replace(/^Next steps:\n/, "")}</Code>
      </div>
    );
  }
  return (
    <div className="grid gap-1 text-[11.5px] text-muted">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Next</div>
      {next.map((n, i) => (
        <div key={i} className="flex gap-2">
          <span className="text-dim tnum">{i + 1}.</span>
          <span className="whitespace-pre-wrap font-mono text-[11.5px]">{n}</span>
        </div>
      ))}
    </div>
  );
}

/** The `add-orgs` dry run: the branch and the files it will touch, without diffs; apply runs the branch workflow. */
function OrgsFiles({ plan, applied }: { plan: Plan; applied: boolean }) {
  const orgs = describeOrgsPlan(plan);
  return (
    <div className="grid gap-2 rounded-lg border border-hairline bg-bg/40 p-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <GitBranch size={12} className="text-accent" />
        <span className="text-muted">{applied ? "Ran on branch" : "Works on branch"}</span>
        <span className="font-mono text-text">{orgs.branch}</span>
        <Badge tone="accent">dry run: files only, no diff</Badge>
      </div>
      <div className="text-[11.5px] text-muted">
        {applied
          ? "orb add orgs merged the files, built the app, regenerated api/ and committed on that branch. Review the branch in git and merge it; the app keeps running from your current branch until you do."
          : "This is the CLI's dry run: the files it would merge, without their content. Apply runs orb add orgs itself: it checks out the branch, merges, builds, regenerates api/openapi.json, records api/surface.json and commits. The console on the Overview shows its output."}
      </div>
      {orgs.files.length > 0 ? (
        <div className="grid max-h-[320px] gap-0.5 overflow-auto">
          {orgs.files.map((f) => (
            <div key={f} className="flex items-center gap-2 font-mono text-[11.5px] text-text">
              <FileCode2 size={11} className="shrink-0 text-dim" /> <span className="truncate">{f}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="font-mono text-[11px] text-dim">the dry run listed no files</div>
      )}
    </div>
  );
}
